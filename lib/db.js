import pg from "pg";

const { Pool } = pg;

const globalKey = Symbol.for("eternalcyberia.qds.pgpool");

let cachedPool = globalThis[globalKey];

function getPool() {
  if (globalThis[globalKey] && globalThis[globalKey] !== cachedPool) {
    cachedPool = globalThis[globalKey];
  }
  if (cachedPool) return cachedPool;
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not configured");
  }
  cachedPool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 3,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 8_000
  });
  globalThis[globalKey] = cachedPool;
  return cachedPool;
}

export const pool = {
  query(...args) {
    return getPool().query(...args);
  },
  connect(...args) {
    return getPool().connect(...args);
  },
  end(...args) {
    return getPool().end(...args);
  }
};
