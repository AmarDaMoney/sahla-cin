// Couche paiement générique (billetterie), indépendante du domaine cinéma.
// Aujourd'hui simulée ; brancher un PSP réel (CIB / SATIM / BaridiMob) ici
// sans toucher au reste de l'application.

export type PaymentMethod = {
  id: "cib" | "baridimob" | "dahabia" | "espece";
  label: string;
  hint: string;
};

export const paymentMethods: PaymentMethod[] = [
  { id: "cib", label: "Carte CIB", hint: "Paiement par carte interbancaire" },
  { id: "baridimob", label: "BaridiMob", hint: "Algérie Poste — paiement mobile" },
  { id: "dahabia", label: "Carte Edahabia", hint: "Algérie Poste" },
  { id: "espece", label: "Paiement au guichet", hint: "Réservez, payez sur place" },
];

export type PaymentResult = { ok: true; reference: string } | { ok: false; error: string };

export async function processPayment(input: {
  method: PaymentMethod["id"];
  amount: number;
}): Promise<PaymentResult> {
  await new Promise((r) => setTimeout(r, 700));
  if (input.amount <= 0) return { ok: false, error: "Montant invalide" };
  return { ok: true, reference: "DZ-" + Math.random().toString(36).slice(2, 8).toUpperCase() };
}
