// Couche paiement générique (billetterie), indépendante du domaine cinéma.
// Le navigateur ne confirme jamais un paiement : il crée la réservation
// (createBooking), puis demande au serveur de lancer le paiement
// (startOnlinePayment dans api.ts). Seul le serveur confirme un paiement.

export type PaymentMethodId = "cib" | "baridimob" | "dahabia" | "espece";

export type PaymentMethod = {
  id: PaymentMethodId;
  label: string;
  hint: string;
};

export const paymentMethods: PaymentMethod[] = [
  { id: "cib", label: "Carte CIB", hint: "Paiement par carte interbancaire" },
  { id: "baridimob", label: "BaridiMob", hint: "Algérie Poste — paiement mobile" },
  { id: "dahabia", label: "Carte Edahabia", hint: "Algérie Poste" },
  { id: "espece", label: "Paiement au guichet", hint: "Réservez, payez sur place" },
];

export type PaymentStart =
  // Paiement confirmé immédiatement (mode simulation).
  | { status: "confirmed" }
  // Prestataire réel : rediriger le client vers la page de paiement.
  | { status: "redirect"; url: string };
