import { eq } from "drizzle-orm";
import type { Auth } from "./auth";
import { adminEmails } from "./config";
import type { Db } from "./db/client";
import { user_roles } from "./db/schema";

export type AppRole = (typeof user_roles.$inferSelect)["role"];

export type Viewer = {
  id: string;
  email: string;
  name: string;
  roles: AppRole[];
};

// Les adresses de ADMIN_EMAILS ont automatiquement le rôle admin, une fois
// l'adresse vérifiée. Retirer une adresse retire le rôle immédiatement.
export async function getViewer(db: Db, auth: Auth, headers: Headers): Promise<Viewer | null> {
  const session = await auth.api.getSession({ headers });
  if (!session) return null;
  const { user } = session;
  const rows = await db
    .select({ role: user_roles.role })
    .from(user_roles)
    .where(eq(user_roles.user_id, user.id));
  const roles = new Set<AppRole>(["client", ...rows.map((r) => r.role)]);
  if (user.emailVerified && adminEmails().includes(user.email.toLowerCase())) roles.add("admin");
  return { id: user.id, email: user.email, name: user.name, roles: [...roles] };
}

export const hasRole = (viewer: Viewer | null, role: AppRole) => !!viewer?.roles.includes(role);
export const isAdmin = (viewer: Viewer | null) => hasRole(viewer, "admin");
