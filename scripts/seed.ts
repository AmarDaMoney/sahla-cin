// Données de démonstration depuis un terminal (même logique que le bouton de
// l'espace admin) : DATABASE_URL=... bun run db:seed
import { getDb } from "@/server/db/client";
import { seedDemo } from "@/server/services/demo";

const result = await seedDemo(getDb());
console.log(`Données de démonstration chargées (${result.screeningsAdded} séances ajoutées)`);
process.exit(0);
