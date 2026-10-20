const lookupForm = document.querySelector("#memberLookupForm");
const lookupError = document.querySelector("#lookupError");
const contributionError = document.querySelector("#contributionError");
const memberDetails = document.querySelector("#memberDetails");
const activeCollectionName = document.querySelector("#activeCollectionName");
const amountInput = document.querySelector("#contributionAmount");
const submitButton = document.querySelector("#submitContributionButton");
const contributionForm = document.querySelector("#contributionForm");
const contributionCard = document.querySelector("#contributionCard");
let verifiedMatricule = "";

async function publicRequest(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: { "Content-Type": "application/json", ...options.headers }
  });
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error || "La demande n'a pas abouti.");
  }
  return payload;
}

lookupForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = lookupForm.querySelector('button[type="submit"]');
  button.disabled = true;
  lookupError.hidden = true;
  contributionError.hidden = true;
  memberDetails.hidden = true;
  amountInput.disabled = true;
  submitButton.disabled = true;
  verifiedMatricule = "";
  activeCollectionName.textContent = "Chargement…";

  try {
    const result = await publicRequest("/api/public/member", {
      method: "POST",
      body: JSON.stringify({ matricule: document.querySelector("#paymentMatricule").value.trim() })
    });
    const { member, collection } = result;
    document.querySelector("#verifiedName").textContent = member.name;
    document.querySelector("#verifiedGrade").textContent = member.grade;
    document.querySelector("#verifiedMatricule").textContent = member.matricule;
    verifiedMatricule = member.matricule;
    memberDetails.hidden = false;
    activeCollectionName.textContent = collection ? collection.name : "Aucune collecte active";
    amountInput.disabled = !collection;
    submitButton.disabled = !collection;
    if (!collection) {
      showFormError(lookupError, "Aucune collecte n'est ouverte pour le moment. Contactez l'association.");
    }
  } catch (error) {
    activeCollectionName.textContent = "Vérifiez d'abord votre matricule";
    showFormError(lookupError, error.message);
  } finally {
    button.disabled = false;
  }
});

function showFormError(element, message) {
  element.textContent = message;
  element.hidden = false;
}

function updateSubmitState() {
  submitButton.disabled = !verifiedMatricule || !amountInput.value || Number(amountInput.value) <= 0;
}

amountInput.addEventListener("input", updateSubmitState);

contributionForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  contributionError.hidden = true;
  submitButton.disabled = true;
  try {
    const result = await publicRequest("/api/public/contributions", {
      method: "POST",
      body: JSON.stringify({
        matricule: verifiedMatricule,
        amount: Number(amountInput.value)
      })
    });
    const collectionName = result.collectionName;
    const formattedAmount = new Intl.NumberFormat("fr-FR").format(Number(amountInput.value));
    contributionCard.hidden = true;
    document.querySelector("#receiptMessage").textContent = `${formattedAmount} FCFA pour « ${collectionName} ».`;
    document.querySelector("#contributionReceipt").hidden = false;
    document.querySelector("#contributionReceipt").dataset.contributionId = result.contributionId;
  } catch (error) {
    showFormError(contributionError, error.message);
    updateSubmitState();
  }
});
