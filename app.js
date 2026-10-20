let transactions = [];
const memberPageSize = 10;
let members = [];
let collections = [];
let memberPage = 0;
let adminToken = "";

const chartData = {
  week: {
    total: 0,
    labels: ["13 oct.", "14 oct.", "15 oct.", "16 oct.", "17 oct.", "18 oct.", "19 oct."],
    values: [0, 0, 0, 0, 0, 0, 0],
    max: 1
  },
  month: {
    total: 0,
    labels: ["1 oct.", "4 oct.", "7 oct.", "10 oct.", "13 oct.", "16 oct.", "19 oct."],
    values: [0, 0, 0, 0, 0, 0, 0],
    max: 1
  },
  year: {
    total: 0,
    labels: ["Mai", "Juin", "Juil.", "Août", "Sept.", "Oct."],
    values: [0, 0, 0, 0, 0, 0],
    max: 1
  }
};

const formatAmount = (amount) => new Intl.NumberFormat("fr-FR").format(amount);
const formatDate = (date) => new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "short", year: "numeric" }).format(date);
const totalCollected = 0;
let showAllTransactions = false;
let toastTimeout;

function renderTransactions() {
  const query = document.querySelector("#searchInput").value.trim().toLocaleLowerCase("fr");
  const matching = transactions.filter((transaction) =>
    `${transaction.name} ${transaction.matricule} ${transaction.collection}`.toLocaleLowerCase("fr").includes(query)
  );
  const visible = showAllTransactions ? matching : matching.slice(0, 5);
  const body = document.querySelector("#transactionsBody");
  body.innerHTML = visible.map((transaction) => `
    <tr>
      <td><div class="member-cell"><span class="member-avatar">${escapeHtml(transaction.grade)}</span><span class="member-name"><strong>${escapeHtml(transaction.name)}</strong><small>Matricule ${escapeHtml(transaction.matricule)}</small></span></div></td>
      <td>${escapeHtml(transaction.collection)}</td>
      <td>${formatDate(new Date(transaction.date))}</td>
      <td class="amount-cell">${formatAmount(transaction.amount)} FCFA</td>
      <td><span class="status ${transaction.status === "confirmed" ? "" : "status-pending"}"><i></i>${transaction.status === "confirmed" ? "Payé" : "À vérifier"}</span></td>
      <td>${transaction.status === "confirmed" ? "Confirmé" : `<button class="button button-secondary confirm-contribution" type="button" data-id="${escapeHtml(transaction.id)}">Confirmer le paiement</button>`}</td>
    </tr>
  `).join("");
  document.querySelector("#emptyState").hidden = matching.length > 0;
  document.querySelector("#tableCount").textContent = matching.length === 0
    ? transactions.length === 0 ? "Aucun paiement enregistré" : "Aucun résultat"
    : `Affichage des ${visible.length} ${visible.length > 1 ? "dernières contributions" : "dernière contribution"}`;
  const viewAll = document.querySelector("#viewAllButton");
  viewAll.hidden = matching.length <= 5;
  viewAll.innerHTML = showAllTransactions ? "Afficher moins <span>↑</span>" : "Voir tous les paiements <span>→</span>";
  document.querySelector("#emptyState").textContent = transactions.length === 0
    ? "Aucune demande de cotisation pour le moment."
    : "Aucune contribution ne correspond à votre recherche.";
}

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character]);
}

function renderChart(period) {
  const data = chartData[period];
  const max = data.max;
  const points = data.values.map((value, index) => ({
    x: data.values.length === 1 ? 350 : (index / (data.values.length - 1)) * 680 + 10,
    y: 210 - (value / max) * 190,
    value
  }));
  const linePath = points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" ");
  const areaPath = `${linePath} L ${points[points.length - 1].x} 220 L ${points[0].x} 220 Z`;
  const svg = document.querySelector("#chartSvg");
  svg.innerHTML = `
    <defs><linearGradient id="chartFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stop-color="#7968ee" stop-opacity=".2"/><stop offset="100%" stop-color="#7968ee" stop-opacity=".01"/></linearGradient></defs>
    <path class="area" d="${areaPath}"></path>
    <path class="line" d="${linePath}"></path>
    ${points.map((point, index) => `<circle class="point" cx="${point.x}" cy="${point.y}" r="4" data-index="${index}" tabindex="0" role="img" aria-label="${data.labels[index]} : ${formatAmount(point.value)} FCFA"></circle>`).join("")}
  `;
  document.querySelector("#chartXAxis").innerHTML = data.labels.map((label) => `<span>${escapeHtml(label)}</span>`).join("");
  document.querySelector("#chartYAxis").innerHTML = [4, 3, 2, 1, 0].map((step) => `<span>${formatAmount(Math.round(max * step / 4))}</span>`).join("");
  document.querySelector("#chartTotal").innerHTML = `${formatAmount(data.total)} <small>FCFA</small>`;
  const tooltip = document.querySelector("#chartTooltip");
  const setTooltip = (point, index) => {
    tooltip.textContent = `${data.labels[index]} · ${formatAmount(point.value)} FCFA`;
    tooltip.style.left = `${(point.x / 700) * 100}%`;
    tooltip.style.top = `${(point.y / 220) * 100}%`;
    tooltip.style.display = "block";
  };
  svg.querySelectorAll(".point").forEach((element, index) => {
    element.addEventListener("mouseenter", () => setTooltip(points[index], index));
    element.addEventListener("focus", () => setTooltip(points[index], index));
    element.addEventListener("mouseleave", () => { tooltip.style.display = "none"; });
    element.addEventListener("blur", () => { tooltip.style.display = "none"; });
  });
}

function renderMembers() {
  const normalizeSearch = (value) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("fr").replace(/[^a-z0-9]/g, "");
  const query = normalizeSearch(document.querySelector("#memberSearch").value.trim());
  const exactMatriculeMatches = query
    ? members.filter(({ matricule }) => matricule && normalizeSearch(matricule) === query)
    : [];
  const matching = exactMatriculeMatches.length > 0
    ? exactMatriculeMatches
    : members.filter(({ name, grade, matricule }) =>
      normalizeSearch(`${name} ${grade} ${matricule}`).includes(query)
    );
  const pageCount = Math.ceil(matching.length / memberPageSize);
  memberPage = Math.min(memberPage, Math.max(0, pageCount - 1));
  const start = memberPage * memberPageSize;
  const visible = matching.slice(start, start + memberPageSize);
  document.querySelector("#membersBody").innerHTML = visible.map(({ name, grade, matricule }) => `
    <tr>
      <td class="member-reference">${escapeHtml(matricule || "Non renseigné")}</td>
      <td>${escapeHtml(grade)}</td>
      <td>${escapeHtml(name)}</td>
    </tr>
  `).join("");
  document.querySelector("#membersEmptyState").hidden = matching.length > 0;
  document.querySelector("#membersTableCount").textContent = matching.length === 0
    ? "Aucun membre trouvé"
    : `Affichage de ${start + 1}–${Math.min(start + visible.length, matching.length)} sur ${formatAmount(matching.length)} membres`;
  document.querySelector("#membersPrevious").disabled = memberPage === 0;
  document.querySelector("#membersNext").disabled = memberPage >= pageCount - 1;
}

async function adminApi(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${adminToken}`,
      ...options.headers
    }
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || "La requête administrateur a échoué.");
  return payload;
}

function showAdminGate(message = "") {
  document.querySelector("#adminApp").hidden = true;
  document.querySelector("#adminLoginGate").hidden = false;
  document.querySelector("#membersBody").innerHTML = "";
  document.querySelector("#transactionsBody").innerHTML = "";
  document.querySelector("#memberCount").textContent = "—";
  document.querySelector("#footerMemberCount").textContent = "—";
  const error = document.querySelector("#adminLoginError");
  error.textContent = message;
  error.hidden = !message;
  document.querySelector("#adminPassword").focus();
}

async function loadAdminData() {
  try {
    const [memberData, contributionData, collectionData] = await Promise.all([
      adminApi("/api/admin/members"),
      adminApi("/api/admin/contributions"),
      adminApi("/api/admin/collections")
    ]);
    members = memberData.members;
    transactions = contributionData.contributions;
    collections = collectionData.collections;
    document.querySelector("#memberCount").textContent = formatAmount(members.length);
    document.querySelector("#footerMemberCount").textContent = formatAmount(members.length);
    const confirmed = transactions.filter((item) => item.status === "confirmed");
    const total = confirmed.reduce((sum, item) => sum + item.amount, 0);
    const contributors = new Set(confirmed.map((item) => item.matricule)).size;
    document.querySelector("#totalCollected").textContent = formatAmount(total);
    document.querySelector("#averageContribution").textContent = formatAmount(confirmed.length ? Math.round(total / confirmed.length) : 0);
    document.querySelector("#goalCollected").textContent = formatAmount(total);
    document.querySelector("#goalContributorCount").textContent = String(contributors);
    document.querySelector("#activeCollectionCount").textContent = String(collections.filter((item) => item.active !== false).length);
    document.querySelector("#collectionNavCount").textContent = String(collections.length);
    document.querySelector("#collectionNavCount").hidden = collections.length === 0;
    renderCollections(collections, confirmed);
    renderMembers();
    renderTransactions();
    const confirmedByDay = confirmed.reduce((totals, contribution) => {
      const date = new Date(contribution.confirmedAt || contribution.date).toLocaleDateString("sv-SE");
      totals[date] = (totals[date] || 0) + contribution.amount;
      return totals;
    }, {});
    chartData.week.labels = Array.from({ length: 7 }, (_, index) => {
      const date = new Date();
      date.setDate(date.getDate() - (6 - index));
      return new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short" }).format(date);
    });
    const lastSevenDates = Array.from({ length: 7 }, (_, index) => {
      const date = new Date();
      date.setHours(12, 0, 0, 0);
      date.setDate(date.getDate() - (6 - index));
      return date.toLocaleDateString("sv-SE");
    });
    chartData.week.values = lastSevenDates.map((date) => confirmedByDay[date] || 0);
    chartData.week.max = Math.max(1, ...chartData.week.values) * 1.15;
    chartData.week.total = chartData.week.values.reduce((sum, amount) => sum + amount, 0);
    chartData.month.total = total;
    chartData.year.total = total;
    document.querySelector("#chartPeriod").value = "week";
    renderChart("week");
    const latestCollection = collections.find((item) => item.active !== false);
    document.querySelector("#shareCollectionButton").disabled = !latestCollection;
    if (!latestCollection) {
      document.querySelector("#goalCollectionName").textContent = "Aucune collecte créée";
      document.querySelector("#goalCollectionEnd").textContent = "Créez une collecte pour la partager aux membres";
      document.querySelector("#goalTarget").textContent = "Facultatif";
      document.querySelector("#goalPercent").textContent = "Aucun objectif fixé";
      document.querySelector("#goalProgressBar").style.width = "0%";
      document.querySelector("#goalCollected").textContent = "0";
      document.querySelector("#goalContributorCount").textContent = "0";
    }
    document.querySelector("#adminLoginGate").hidden = true;
    document.querySelector("#adminApp").hidden = false;
  } catch (error) {
    adminToken = "";
    showAdminGate(error.message);
  }
}

function renderCollections(collectionItems, confirmedContributions) {
  const collection = collectionItems.find((item) => item.active !== false);
  if (!collection) return;
  const collected = confirmedContributions
    .filter((item) => item.collectionId === collection.id)
    .reduce((sum, item) => sum + item.amount, 0);
  const contributorCount = new Set(confirmedContributions
    .filter((item) => item.collectionId === collection.id)
    .map((item) => item.matricule)).size;
  const percent = collection.goal ? Math.min(100, (collected / collection.goal) * 100) : 0;
  document.querySelector("#goalCollectionName").textContent = collection.name;
  document.querySelector("#goalCollectionEnd").textContent = collection.endDate
    ? `Se termine le ${new Intl.DateTimeFormat("fr-FR", { dateStyle: "long" }).format(new Date(`${collection.endDate}T12:00:00`))}`
    : "Collecte en cours";
  document.querySelector("#goalCollected").textContent = formatAmount(collected);
  document.querySelector("#goalTarget").textContent = collection.goal ? `${formatAmount(collection.goal)} FCFA` : "Aucun objectif fixé";
  document.querySelector("#goalPercent").textContent = collection.goal ? `${new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 }).format(percent)} % atteint` : "Montant libre";
  document.querySelector("#goalProgressBar").style.width = `${percent}%`;
  document.querySelector(".progress-track").setAttribute("aria-valuenow", String(Math.round(percent)));
  document.querySelector("#goalContributorCount").textContent = String(contributorCount);
}

function showToast(message) {
  const toast = document.querySelector("#toast");
  toast.textContent = message;
  toast.classList.add("is-visible");
  window.clearTimeout(toastTimeout);
  toastTimeout = window.setTimeout(() => toast.classList.remove("is-visible"), 3200);
}

function openModal() {
  const modal = document.querySelector("#collectionModal");
  modal.hidden = false;
  document.querySelector("#collectionName").focus();
}

function closeModal() {
  document.querySelector("#collectionModal").hidden = true;
}

function exportTransactions() {
  const rows = [
    ["Membre", "Matricule", "Collecte", "Date", "Montant (FCFA)", "Statut"],
    ...transactions.map((transaction) => [
      transaction.name, transaction.matricule, transaction.collection, formatDate(new Date(transaction.date)),
      transaction.amount, transaction.status === "confirmed" ? "Payé" : "À vérifier"
    ])
  ];
  const csv = `\uFEFF${rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(";")).join("\r\n")}`;
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  link.download = "contributions-collecti.csv";
  link.click();
  URL.revokeObjectURL(link.href);
  showToast(transactions.length === 0
    ? "Aucune cotisation à exporter."
    : "Le rapport des cotisations a été téléchargé.");
}

function initialize() {
  document.querySelector("#totalCollected").textContent = formatAmount(totalCollected);
  document.querySelector("#memberCount").textContent = "—";
  document.querySelector("#footerMemberCount").textContent = "—";
  document.querySelector("#averageContribution").textContent = formatAmount(0);
  document.querySelector("#goalCollected").textContent = formatAmount(totalCollected);
  document.querySelector("#goalPercent").textContent = "Aucun objectif fixé";
  document.querySelector("#goalProgressBar").style.width = "0%";
  document.querySelector("#goalContributorCount").textContent = "0";
  document.querySelector("#todayLabel").textContent = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(new Date());
  renderTransactions();
  renderChart(document.querySelector("#chartPeriod").value);

  document.querySelector("#chartPeriod").addEventListener("change", (event) => renderChart(event.target.value));
  document.querySelector("#searchInput").addEventListener("input", () => {
    showAllTransactions = false;
    renderTransactions();
  });
  document.querySelector("#memberSearch").addEventListener("input", () => {
    memberPage = 0;
    renderMembers();
  });
  document.querySelector("#membersPrevious").addEventListener("click", () => {
    memberPage -= 1;
    renderMembers();
  });
  document.querySelector("#membersNext").addEventListener("click", () => {
    memberPage += 1;
    renderMembers();
  });
  document.querySelector("#adminLoginForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const password = document.querySelector("#adminPassword").value;
    try {
      const response = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Connexion administrateur impossible.");
      adminToken = result.token;
      document.querySelector("#adminPassword").value = "";
      await loadAdminData();
    } catch (error) {
      showAdminGate(error.message);
    }
  });
  document.querySelector("#adminLogoutButton").addEventListener("click", async () => {
    let logoutError = "";
    try {
      await adminApi("/api/admin/logout", { method: "POST" });
    } catch (error) {
      logoutError = error.message;
    }
    adminToken = "";
    members = [];
    transactions = [];
    showAdminGate(logoutError ? `Session locale fermée, mais la session serveur n'a pas pu être révoquée : ${logoutError}` : "Vous êtes déconnecté.");
  });
  document.querySelector("#transactionsBody").addEventListener("click", async (event) => {
    const button = event.target.closest(".confirm-contribution");
    if (!button) return;
    button.disabled = true;
    try {
      await adminApi(`/api/admin/contributions/${encodeURIComponent(button.dataset.id)}/confirm`, { method: "POST" });
      await loadAdminData();
      showToast("Cotisation marquée comme payée après vérification.");
    } catch (error) {
      button.disabled = false;
      showToast(error.message);
    }
  });
  document.querySelector("#exportButton").addEventListener("click", exportTransactions);
  document.querySelector("#viewAllButton").addEventListener("click", (event) => {
    event.preventDefault();
    showAllTransactions = !showAllTransactions;
    renderTransactions();
  });
  document.querySelector("#newCollectionButton").addEventListener("click", openModal);
  document.querySelector("#closeModal").addEventListener("click", closeModal);
  document.querySelector("#collectionModal").addEventListener("click", (event) => {
    if (event.target.id === "collectionModal") closeModal();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeModal();
  });
  document.querySelector("#collectionForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const name = formData.get("name").trim();
    const goalValue = formData.get("goal");
    const goal = goalValue ? Number(goalValue) : null;
    const endDate = formData.get("endDate");
    if (!name) return;
    try {
      await adminApi("/api/admin/collections", {
        method: "POST",
        body: JSON.stringify({ name, goal, endDate })
      });
      closeModal();
      form.reset();
      await loadAdminData();
      showToast(`La collecte « ${name} » a été créée. Les membres peuvent choisir librement leur montant.`);
    } catch (error) {
      showToast(error.message);
    }
  });
  document.querySelector("#shareCollectionButton").addEventListener("click", async () => {
    const paymentUrl = new URL("paiement.html", window.location.href);
    const shareData = { title: "Payer ma cotisation", text: "Entrez votre matricule et choisissez librement le montant de votre cotisation.", url: paymentUrl.href };
    if (navigator.share) {
      try {
        await navigator.share(shareData);
      } catch (error) {
        if (error.name !== "AbortError") showToast("Le partage n'a pas pu être effectué.");
      }
    } else if (navigator.clipboard && window.isSecureContext) {
      try {
        await navigator.clipboard.writeText(shareData.url);
        showToast("Le lien de la collecte a été copié.");
      } catch {
        showToast("La copie du lien n'a pas fonctionné sur cet appareil.");
      }
    } else {
      showToast("Ouvrez cette page dans un navigateur compatible pour partager la collecte.");
    }
  });
  document.querySelectorAll(".nav-link").forEach((link) => {
    link.addEventListener("click", () => {
      document.querySelectorAll(".nav-link").forEach((item) => item.classList.remove("is-active"));
      link.classList.add("is-active");
      if (!["#overview", "#collections", "#payments", "#members"].includes(link.getAttribute("href"))) {
        showToast("Cette rubrique sera disponible dans une prochaine version.");
      }
      document.querySelector("#sidebar").classList.remove("is-open");
    });
  });
  document.querySelector("#mobileMenu").addEventListener("click", () => document.querySelector("#sidebar").classList.toggle("is-open"));
  showAdminGate("Connectez-vous avec le mot de passe administrateur configuré dans .env.");
}

initialize();
