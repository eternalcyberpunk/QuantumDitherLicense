import pg from "pg";

const { Pool } = pg;

const globalKey = Symbol.for("eternalcyberia.qds.pgpool");

export function getPool() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not configured");
  }

  if (!globalThis[globalKey]) {
    globalThis[globalKey] = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 3,
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 8_000
    });
  }

  return globalThis[globalKey];
}

export const pool = {
  query(...args) {
    return getPool().query(...args);
  },
  connect(...args) {
    return getPool().connect(...args);
  }
};
