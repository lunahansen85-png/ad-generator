import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

type Db = ReturnType<typeof drizzle<typeof schema>>;

const globalForDb = globalThis as unknown as { __pool?: Pool; __db?: Db };

/**
 * Forbindelsen oprettes FOERST naar den bruges.
 * Ellers ville Next.js' build forsoege at forbinde til databasen,
 * og builden ville fejle uden DATABASE_URL.
 */
function getDb(): Db {
  if (globalForDb.__db) return globalForDb.__db;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL mangler. Saet den i Railway (eller .env.local lokalt).");
  }

  const pool = globalForDb.__pool ?? new Pool({ connectionString, max: 5 });
  globalForDb.__pool = pool;

  const instance = drizzle(pool, { schema });
  globalForDb.__db = instance;
  return instance;
}

export const db = new Proxy({} as Db, {
  get(_target, prop, receiver) {
    const real = getDb() as unknown as Record<string | symbol, unknown>;
    const value = Reflect.get(real, prop, receiver);
    return typeof value === "function" ? value.bind(real) : value;
  },
});

export { schema };
