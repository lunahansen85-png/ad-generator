// Koeres af Railways pre-deploy command FOER den nye version faar trafik.
// Ren .mjs (ikke TypeScript), saa den ikke afhaenger af dev-dependencies.
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL mangler — migration afbrudt.");
  process.exit(1);
}

const pool = new pg.Pool({ connectionString, max: 1 });
try {
  await migrate(drizzle(pool), { migrationsFolder: "./drizzle" });
  console.log("Migrationer koert OK.");
} catch (err) {
  console.error("Migration fejlede:", err);
  process.exit(1);
} finally {
  await pool.end();
}
