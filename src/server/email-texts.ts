// Textes des e-mails, dans la langue de l'utilisateur au moment de l'action.
import type { Lang } from "@/lib/i18n/lang";

export const EMAIL_TEXTS = {
  fr: {
    ignore: "Si vous n'êtes pas à l'origine de cette demande, ignorez ce message.",
    verify: {
      subject: "Confirmez votre adresse e-mail",
      intro: (name: string) =>
        `Bienvenue ${name} ! Confirmez votre adresse pour activer votre compte BookCinéDZ.`,
      action: "Confirmer mon adresse",
    },
    reset: {
      subject: "Réinitialisation de votre mot de passe",
      intro: "Vous avez demandé à changer le mot de passe de votre compte BookCinéDZ.",
      action: "Choisir un nouveau mot de passe",
    },
    booking: {
      subjectPaid: "Votre billet BookCinéDZ",
      subjectPending: "Votre réservation BookCinéDZ",
      seats: "Sièges",
      total: "Total",
      paid: "payé",
      pending: "à régler au guichet au plus tard 15 min avant la séance",
      reference: "Référence",
      show: "Présentez le QR code de votre billet à l'entrée.",
      action: "Voir mon billet",
      currency: "DA",
    },
  },
  ar: {
    ignore: "إذا لم تقم بهذا الطلب، تجاهل هذه الرسالة.",
    verify: {
      subject: "أكّد عنوان بريدك الإلكتروني",
      intro: (name: string) => `مرحباً ${name}! أكّد عنوانك لتفعيل حسابك في BookCinéDZ.`,
      action: "تأكيد عنواني",
    },
    reset: {
      subject: "إعادة تعيين كلمة المرور",
      intro: "طلبت تغيير كلمة مرور حسابك في BookCinéDZ.",
      action: "اختيار كلمة مرور جديدة",
    },
    booking: {
      subjectPaid: "تذكرتك من BookCinéDZ",
      subjectPending: "حجزك في BookCinéDZ",
      seats: "المقاعد",
      total: "المجموع",
      paid: "مدفوع",
      pending: "يُدفع في الشباك قبل 15 دقيقة على الأقل من العرض",
      reference: "المرجع",
      show: "قدّم رمز QR الخاص بتذكرتك عند المدخل.",
      action: "عرض تذكرتي",
      currency: "دج",
    },
  },
  en: {
    ignore: "If you didn't make this request, you can ignore this message.",
    verify: {
      subject: "Confirm your email address",
      intro: (name: string) =>
        `Welcome ${name}! Confirm your address to activate your BookCinéDZ account.`,
      action: "Confirm my address",
    },
    reset: {
      subject: "Reset your password",
      intro: "You asked to change the password of your BookCinéDZ account.",
      action: "Choose a new password",
    },
    booking: {
      subjectPaid: "Your BookCinéDZ ticket",
      subjectPending: "Your BookCinéDZ booking",
      seats: "Seats",
      total: "Total",
      paid: "paid",
      pending: "pay at the ticket desk at least 15 min before the show",
      reference: "Reference",
      show: "Show your ticket's QR code at the entrance.",
      action: "View my ticket",
      currency: "DZD",
    },
  },
} satisfies Record<Lang, unknown>;
