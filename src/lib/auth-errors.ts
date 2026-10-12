// Traduit les codes d'erreur de Better Auth en messages pour l'utilisateur.
const messages: Record<string, string> = {
  INVALID_EMAIL_OR_PASSWORD: "E-mail ou mot de passe incorrect.",
  INVALID_EMAIL: "Adresse e-mail invalide.",
  INVALID_PASSWORD: "Mot de passe incorrect.",
  USER_ALREADY_EXISTS: "Un compte existe déjà avec cette adresse.",
  USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: "Un compte existe déjà avec cette adresse.",
  PASSWORD_TOO_SHORT: "Mot de passe trop court (8 caractères minimum).",
  PASSWORD_TOO_LONG: "Mot de passe trop long.",
  EMAIL_NOT_VERIFIED: "Adresse e-mail non confirmée. Vérifiez votre boîte mail.",
  INVALID_TOKEN: "Lien invalide ou expiré.",
};

export function authErrorMessage(error: {
  code?: string | undefined;
  status?: number | undefined;
  message?: string | undefined;
}) {
  if (error.status === 429) return "Trop de tentatives. Réessayez dans quelques minutes.";
  return (error.code && messages[error.code]) || "Une erreur est survenue. Réessayez.";
}
