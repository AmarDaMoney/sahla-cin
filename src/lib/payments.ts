// Couche paiement générique (billetterie), indépendante du domaine cinéma.
// Le navigateur ne confirme jamais un paiement : il crée la réservation
// (createBooking), puis demande au serveur de lancer le paiement
// (startOnlinePayment dans api.ts). Seul le serveur confirme un paiement.

export type PaymentMethodId = "cib" | "baridimob" | "dahabia" | "espece";

// Libellés : dictionnaires de langue (t.payments[id]).
export const paymentMethods: PaymentMethodId[] = ["cib", "baridimob", "dahabia", "espece"];

export type PaymentStart =
  // Paiement confirmé immédiatement (mode simulation).
  | { status: "confirmed" }
  // Prestataire réel : rediriger le client vers la page de paiement.
  | { status: "redirect"; url: string };
