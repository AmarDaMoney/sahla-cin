import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { PaymentStart } from "@/lib/payments";

// Lance le paiement en ligne d'une réservation du client connecté.
//
// PAYMENT_MODE=simulation : le paiement est accepté immédiatement (démo, tests).
// Sans PAYMENT_MODE : le paiement en ligne est désactivé, seul le paiement au
// guichet fonctionne.
//
// Pour brancher un vrai prestataire (SATIM / CIB-Edahabia via une banque,
// Chargily Pay, Slick Pay…) : créer ici la session de paiement et renvoyer
// { status: "redirect", url }, puis appeler confirm_booking_payment depuis une
// route webhook qui vérifie la signature du prestataire.
export const startOnlinePayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { bookingId: string }) => {
    if (typeof input?.bookingId !== "string" || !input.bookingId) {
      throw new Error("Réservation invalide");
    }
    return input;
  })
  .handler(async ({ data, context }): Promise<PaymentStart> => {
    // Lecture avec les droits du client : RLS garantit que c'est sa réservation.
    const { data: booking, error } = await context.supabase
      .from("bookings")
      .select("id, status, total_amount, payment_method")
      .eq("id", data.bookingId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!booking) throw new Error("Réservation introuvable");
    if (booking.status === "confirme") return { status: "confirmed" };
    if (booking.status !== "en_attente_paiement" || booking.payment_method === "espece") {
      throw new Error("Cette réservation ne peut pas être payée en ligne");
    }

    if (process.env["PAYMENT_MODE"] !== "simulation") {
      throw new Error(
        "Le paiement en ligne n'est pas encore disponible. Choisissez « Paiement au guichet ».",
      );
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: result, error: rpcError } = await supabaseAdmin.rpc("confirm_booking_payment", {
      _booking_id: booking.id,
      _amount: booking.total_amount,
      _reference: `SIM-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
    });
    if (rpcError) throw new Error(rpcError.message);
    if (result !== "confirmed" && result !== "already_confirmed") {
      throw new Error("Paiement refusé : la réservation a expiré");
    }
    return { status: "confirmed" };
  });
