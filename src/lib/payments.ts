// Couche paiement générique (billetterie), indépendante du domaine cinéma.
// Le navigateur ne confirme jamais un paiement : il crée la réservation
// (book_seats), puis demande au serveur de lancer le paiement
// (startOnlinePayment dans payments.functions.ts). Seul le serveur, via la clé
// service_role, appelle confirm_booking_payment.

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
