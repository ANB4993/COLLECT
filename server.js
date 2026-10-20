const crypto = require("node:crypto");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");

const root = __dirname;
const privateDirectory = path.join(root, "private-data");
const membersPath = path.join(privateDirectory, "members.json");
const demoMembersPath = path.join(root, "demo-data", "members.json");
const contributionsPath = path.join(privateDirectory, "contributions.json");
const collectionsPath = path.join(privateDirectory, "collections.json");
const sessions = new Map();
const requestLimits = new Map();
const sessionDurationMs = 8 * 60 * 60 * 1000;
const staticFiles = new Map([
  ["/", ["index.html", "text/html; charset=utf-8"]],
  ["/index.html", ["index.html", "text/html; charset=utf-8"]],
  ["/paiement.html", ["paiement.html", "text/html; charset=utf-8"]],
  ["/styles.css", ["styles.css", "text/css; charset=utf-8"]],
  ["/app.js", ["app.js", "text/javascript; charset=utf-8"]],
  ["/payment.js", ["payment.js", "text/javascript; charset=utf-8"]]
]);

function loadEnvironment() {
  const envPath = path.join(root, ".env");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (match && !Object.hasOwn(process.env, match[1])) {
      process.env[match[1]] = match[2].replace(/^(['"])(.*)\1$/, "$2");
    }
  }
}

loadEnvironment();

function json(response, status, payload) {
  response.writeHead(status, {
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
    "X-Content-Type-Options": "nosniff"
  });
  response.end(JSON.stringify(payload));
}

function safeEqual(first, second) {
  const left = Buffer.from(first);
  const right = Buffer.from(second);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function readPrivateJson(filePath, fallback) {
  if (!fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writePrivateJson(filePath, value) {
  fs.mkdirSync(privateDirectory, { recursive: true });
  const temporaryPath = `${filePath}.tmp`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  fs.renameSync(temporaryPath, filePath);
}

function readMembers() {
  const members = readPrivateJson(process.env.DEMO_MODE === "true" ? demoMembersPath : membersPath, []);
  if (!Array.isArray(members) || members.length === 0) throw new Error("La liste privée des membres est absente ou vide.");
  return members;
}

function readContributions() {
  const contributions = readPrivateJson(contributionsPath, []);
  if (!Array.isArray(contributions)) throw new Error("Le fichier des contributions est invalide.");
  return contributions;
}

function readCollections() {
  const collections = readPrivateJson(collectionsPath, []);
  if (!Array.isArray(collections)) throw new Error("Le fichier des collectes est invalide.");
  return collections;
}

async function readBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 16_384) throw new Error("La requête est trop volumineuse.");
    chunks.push(chunk);
  }
  const value = Buffer.concat(chunks).toString("utf8");
  return value ? JSON.parse(value) : {};
}

function normalizeMatricule(value) {
  return String(value || "").replace(/\D/g, "");
}

function limited(key, maximum, windowMs) {
  const now = Date.now();
  const entry = requestLimits.get(key);
  if (!entry || now >= entry.expiresAt) {
    requestLimits.set(key, { count: 1, expiresAt: now + windowMs });
    return false;
  }
  entry.count += 1;
  return entry.count > maximum;
}

function clientAddress(request) {
  const address = request.socket.remoteAddress || "unknown";
  const trustedProxy = process.env.TRUSTED_PROXY || "";
  const normalizeAddress = (value) => value.replace(/^::ffff:/, "");
  if (trustedProxy && normalizeAddress(address) === normalizeAddress(trustedProxy)) {
    const forwarded = request.headers["x-forwarded-for"];
    if (typeof forwarded === "string") {
      const forwardedAddress = forwarded.split(",")[0].trim();
      if (forwardedAddress) return forwardedAddress;
    }
  }
  return address;
}

function createAdminSession() {
  const token = crypto.randomBytes(32).toString("base64url");
  sessions.set(token, { expiresAt: Date.now() + sessionDurationMs });
  return token;
}

function hasAdminSession(request) {
  const token = (request.headers.authorization || "").replace(/^Bearer\s+/i, "");
  const session = sessions.get(token);
  if (!session || session.expiresAt <= Date.now()) {
    if (token) sessions.delete(token);
    return false;
  }
  return true;
}

async function handleApi(request, response, url) {
  if (url.pathname === "/api/public/member" && request.method === "POST") {
    let body;
    try {
      body = await readBody(request);
    } catch {
      return json(response, 400, { error: "Requête invalide." });
    }
    const matricule = normalizeMatricule(body.matricule);
    if (!/^\d{5,6}$/.test(matricule)) return json(response, 400, { error: "Saisissez un matricule valide." });
    const address = clientAddress(request);
    if (limited(`lookup:${address}`, 30, 60 * 60 * 1000)) {
      return json(response, 429, { error: "Trop de recherches. Réessayez plus tard." });
    }
    const member = readMembers().find((item) => normalizeMatricule(item.matricule) === matricule);
    if (!member) return json(response, 404, { error: "Matricule introuvable. Vérifiez-le ou contactez l'association." });
    const collection = readCollections().find((item) => item.active !== false) || null;
    return json(response, 200, {
      member: { matricule: member.matricule, grade: member.grade, name: member.name },
      collection: collection ? { id: collection.id, name: collection.name } : null
    });
  }

  if (url.pathname === "/api/public/contributions" && request.method === "POST") {
    let body;
    try {
      body = await readBody(request);
    } catch {
      return json(response, 400, { error: "Requête invalide." });
    }
    const matricule = normalizeMatricule(body.matricule);
    const amount = Number(body.amount);
    if (!/^\d{5,6}$/.test(matricule) || !Number.isSafeInteger(amount) || amount < 1 || amount > 50_000_000) {
      return json(response, 400, { error: "Vérifiez le matricule et saisissez un montant entre 1 et 50 000 000 FCFA." });
    }
    const address = clientAddress(request);
    if (limited(`contribution:${address}`, 10, 60 * 60 * 1000)) {
      return json(response, 429, { error: "Trop de demandes de contribution. Réessayez plus tard." });
    }
    const member = readMembers().find((item) => normalizeMatricule(item.matricule) === matricule);
    if (!member) return json(response, 404, { error: "Matricule introuvable. Vérifiez-le ou contactez l'association." });
    const collections = readCollections();
    const collection = collections.find((item) => item.active !== false);
    if (!collection) return json(response, 400, { error: "Aucune collecte active. Contactez l'association." });
    const contributions = readContributions();
    const contribution = {
      id: crypto.randomUUID(),
      matricule: member.matricule,
      name: member.name,
      grade: member.grade,
      collectionId: collection.id,
      collection: collection.name,
      amount,
      status: "pending",
      date: new Date().toISOString()
    };
    contributions.unshift(contribution);
    writePrivateJson(contributionsPath, contributions);
    return json(response, 201, {
      message: "Votre demande de cotisation est enregistrée. Le paiement sera marqué comme reçu après vérification par l'association.",
      contributionId: contribution.id,
      collectionName: collection.name
    });
  }

  if (url.pathname === "/api/admin/login" && request.method === "POST") {
    let body;
    try {
      body = await readBody(request);
    } catch {
      return json(response, 400, { error: "Requête de connexion invalide." });
    }
    const configured = process.env.ADMIN_PASSWORD || "";
    if (configured.length < 16) return json(response, 503, { error: "Définissez un mot de passe administrateur d'au moins 16 caractères dans .env." });
    const address = clientAddress(request);
    if (limited(`admin:${address}`, 8, 15 * 60 * 1000)) return json(response, 429, { error: "Trop de tentatives. Réessayez dans 15 minutes." });
    if (!safeEqual(String(body.password || ""), configured)) return json(response, 401, { error: "Mot de passe incorrect." });
    return json(response, 200, { token: createAdminSession() });
  }

  if (url.pathname === "/api/admin/logout" && request.method === "POST") {
    const token = (request.headers.authorization || "").replace(/^Bearer\s+/i, "");
    sessions.delete(token);
    return json(response, 200, { ok: true });
  }

  if (url.pathname.startsWith("/api/admin/") && !hasAdminSession(request)) {
    return json(response, 401, { error: "Session administrateur absente ou expirée." });
  }

  if (url.pathname === "/api/admin/members" && request.method === "GET") {
    return json(response, 200, { members: readMembers() });
  }

  if (url.pathname === "/api/admin/contributions" && request.method === "GET") {
    return json(response, 200, { contributions: readContributions() });
  }

  if (url.pathname === "/api/admin/collections" && request.method === "GET") {
    return json(response, 200, { collections: readCollections() });
  }

  if (url.pathname === "/api/admin/collections" && request.method === "POST") {
    let body;
    try {
      body = await readBody(request);
    } catch {
      return json(response, 400, { error: "Requête de création invalide." });
    }
    const name = String(body.name || "").trim();
    const goal = body.goal === "" || body.goal == null ? null : Number(body.goal);
    const endDate = body.endDate ? String(body.endDate) : "";
    if (!name || name.length > 60 || (goal !== null && (!Number.isSafeInteger(goal) || goal < 0 || goal > 2_000_000_000))) {
      return json(response, 400, { error: "Vérifiez le nom et l'objectif facultatif de la collecte." });
    }
    const collections = readCollections();
    for (const existing of collections) existing.active = false;
    const collection = { id: crypto.randomUUID(), name, goal, endDate, createdAt: new Date().toISOString(), active: true };
    collections.unshift(collection);
    writePrivateJson(collectionsPath, collections);
    return json(response, 201, { collection });
  }

  if (url.pathname.startsWith("/api/admin/contributions/") && request.method === "POST") {
    const id = url.pathname.slice("/api/admin/contributions/".length).replace(/\/confirm$/, "");
    if (!id || id.includes("/")) return json(response, 404, { error: "Contribution introuvable." });
    const contributions = readContributions();
    const contribution = contributions.find((item) => item.id === id);
    if (!contribution) return json(response, 404, { error: "Contribution introuvable." });
    if (url.pathname.endsWith("/confirm")) {
      contribution.status = "confirmed";
      contribution.confirmedAt = new Date().toISOString();
      writePrivateJson(contributionsPath, contributions);
      return json(response, 200, { contribution });
    }
  }

  if (url.pathname.startsWith("/api/admin/")) return json(response, 404, { error: "Route administrateur introuvable." });
  return json(response, 404, { error: "Route introuvable." });
}

function serveStatic(request, response, url) {
  const entry = staticFiles.get(url.pathname);
  if (!entry || url.search) {
    response.writeHead(404);
    response.end("Page introuvable.");
    return;
  }
  const [filename, contentType] = entry;
  const filePath = path.join(root, filename);
  fs.readFile(filePath, (error, content) => {
    if (error) {
      console.error(`Lecture du fichier ${filename} impossible : ${error.message}`);
      response.writeHead(500);
      response.end("Erreur de lecture de l'application.");
      return;
    }
    response.writeHead(200, {
      "Cache-Control": "no-store",
      "Content-Security-Policy": "default-src 'self' https://fonts.googleapis.com https://fonts.gstatic.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'",
      "Content-Type": contentType,
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
      "Referrer-Policy": "no-referrer"
    });
    response.end(content);
  });
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);
  try {
    if (url.pathname.startsWith("/api/")) {
      await handleApi(request, response, url);
      return;
    }
    if (request.method !== "GET" && request.method !== "HEAD") {
      response.writeHead(405, { Allow: "GET, HEAD" });
      response.end("Méthode non autorisée.");
      return;
    }
    serveStatic(request, response, url);
  } catch (error) {
    console.error(error.message);
    if (!response.headersSent) json(response, 500, { error: "Une erreur est survenue. Consultez les journaux du serveur." });
    else response.end();
  }
});

const port = Number(process.env.PORT || 4173);
const host = process.env.HOST || (process.env.RENDER ? "0.0.0.0" : "127.0.0.1");
server.listen(port, host, () => {
  console.log(`Collecti est disponible sur http://${host}:${port}`);
  if (process.env.ADMIN_PASSWORD) console.log("Un seul accès administrateur est configuré.");
  else console.log("Connexion verrouillée : renseignez ADMIN_PASSWORD dans .env.");
});

function shutdown() {
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 5_000).unref();
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
