// Erreur « attendue » : son message est montré tel quel à l'utilisateur.
// Toute autre erreur est remplacée par un message générique (voir
// src/start.ts) pour ne jamais exposer de détails internes.
export class AppError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export function isUniqueViolation(error: unknown): boolean {
  let e: unknown = error;
  for (let i = 0; i < 3 && e; i++) {
    if (typeof e === "object" && e !== null && (e as { code?: unknown }).code === "23505") {
      return true;
    }
    e = (e as { cause?: unknown }).cause;
  }
  return false;
}
