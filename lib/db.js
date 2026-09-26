import pg from "pg";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not configured");
}

const globalKey = Symbol.for("eternalcyberia.qds.pgpool");

export const pool = globalThis[globalKey] ?? new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 3,
  idleTimeoutMillis: 10_000,
  connectionTimeoutMillis: 8_000
});

globalThis[globalKey] = pool;
