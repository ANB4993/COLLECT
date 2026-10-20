# Collecti

Application locale de suivi des cotisations avec un seul accès administrateur.

## Démarrer

1. Installez Node.js 20 ou une version plus récente.
2. Copiez `.env.example` vers `.env`.
3. Remplacez `ADMIN_PASSWORD` par un mot de passe unique d'au moins 16 caractères.
4. Lancez `npm start`, puis ouvrez <http://127.0.0.1:4173>.

Le serveur écoute uniquement sur l'ordinateur local par défaut (`HOST=127.0.0.1`). Les membres sur d'autres appareils ne peuvent donc pas ouvrir ce lien. Pour que les membres y accèdent depuis Internet, il faut un serveur et un domaine.

## Essai gratuit sur Render

Le fichier `render.yaml` prépare un service Render gratuit en mode démo. Il utilise uniquement le membre fictif `99999 / TEST / MEMBRE DE TEST`, fourni dans `demo-data/members.json`. Ne changez pas `DEMO_MODE` et ne transférez jamais le registre officiel vers ce service gratuit.

1. Créez un dépôt GitHub privé et envoyez-y les fichiers de l'application. Vérifiez que `.env` et `private-data/` ne sont pas ajoutés au dépôt ; ils sont exclus par `.gitignore`.
2. Dans Render, choisissez **New + → Blueprint**, connectez le dépôt privé et laissez Render lire `render.yaml`.
3. Quand Render le demande, définissez `ADMIN_PASSWORD` avec un mot de passe temporaire réservé à la démo, d'au moins 16 caractères.
4. Déployez, ouvrez l'adresse `onrender.com`, connectez-vous comme administrateur, créez une collecte et testez avec le matricule fictif `99999`.

Sur l'offre gratuite, les cotisations enregistrées sont des données de démonstration temporaires : le service peut s'endormir et son système de fichiers n'est pas persistant. Ne faites aucun paiement réel et ne saisissez aucune donnée réelle de membre.

## Préparer un VPS privé

Pour ce registre de membres, privilégiez un serveur contrôlé par l'association et vérifiez que son hébergement est autorisé pour ces données. Aucun fichier de `private-data` n'est inclus dans les exemples de déploiement.

Les exemples de service Linux et de proxy HTTPS se trouvent dans `deploy/collecti.service.example` et `deploy/Caddyfile.example`. Ils supposent un VPS Linux, Node.js installé à `/usr/bin/node`, Caddy, un domaine dont le DNS pointe vers le VPS, et l'application installée dans `/opt/collecti`.

1. Installez l'application dans `/opt/collecti`, créez un compte système `collecti`, puis attribuez à ce compte l'accès en lecture aux fichiers de l'application.
2. Créez `/opt/collecti/private-data` avec le propriétaire `collecti:collecti` et les permissions `700`. Transférez les données privées uniquement par un canal sécurisé et uniquement après avoir validé l'hébergement de ces données.
3. Créez `/etc/collecti.env` avec `HOST=127.0.0.1`, `PORT=4173`, `TRUSTED_PROXY=127.0.0.1` et un `ADMIN_PASSWORD` unique d'au moins 16 caractères. Protégez ce fichier (`root:root`, permissions `600`) et ne communiquez jamais son contenu.
4. Installez les exemples de service systemd et Caddy aux emplacements système correspondants. Remplacez `cotisations.example.com` par le domaine choisi. Caddy fournit HTTPS automatiquement lorsque le DNS et les ports 80/443 sont correctement configurés.
5. Démarrez le service et vérifiez le site en HTTPS. Gardez le port 4173 inaccessible depuis Internet : le proxy Caddy doit être le seul à accéder au serveur Node local.

La variable `TRUSTED_PROXY` ne doit être définie que lorsque Node écoute sur l'interface locale et reçoit les requêtes d'un proxy de confiance. Elle permet aux limites de requêtes de distinguer les adresses des visiteurs.

## Parcours de cotisation

- L'administrateur crée une collecte et partage le même lien générique `paiement.html` à tous les membres.
- Le membre n'a pas de compte : il saisit son matricule, vérifie le nom affiché puis saisit librement un montant.
- La demande est enregistrée localement dans `private-data/contributions.json`, avec le matricule, le nom, la collecte, le montant et le statut « À vérifier ».
- L'administrateur consulte ces demandes dans le tableau de bord et ne confirme le paiement qu'après avoir vérifié le transfert. Seuls les paiements confirmés comptent dans les totaux.
- Une nouvelle collecte devient la collecte active ; les précédentes sont conservées pour l'historique.

Le lien enregistre une déclaration de contribution, mais ne débite pas le membre et ne vérifie pas automatiquement un transfert. L'intégration Wave Business/Mobile Money n'est pas encore configurée : tant qu'elle n'est pas réalisée, l'administrateur doit vérifier les transferts séparément.

## Données et confidentialité

Le registre officiel est stocké dans `private-data/members.json`. Les collectes et les cotisations sont enregistrées dans `private-data/collections.json` et `private-data/contributions.json`. Ces fichiers ne sont pas accessibles comme fichiers publics ; seul le tableau de bord authentifié peut lire le registre et les cotisations. Gardez le répertoire `private-data` et ses sauvegardes privés.

Le mot de passe est configuré dans `.env` en local ou dans le fichier d'environnement protégé du service sur VPS ; il ne doit pas être partagé ni versionné. Le serveur utilise des sessions administrateur en mémoire de huit heures. Préparez des sauvegardes chiffrées et testez leur restauration sans les rendre publiquement accessibles.
