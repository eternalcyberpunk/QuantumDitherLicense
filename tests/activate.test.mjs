import test from "node:test";
import assert from "node:assert/strict";
import handler from "../api/activate.js";
import { licenseHash } from "../lib/security.js";

const poolKey = Symbol.for("eternalcyberia.qds.pgpool");

function createResponse() {
  return {
    headers: {},
    statusCode: null,
    payload: null,
    setHeader(name, value) {
      this.headers[name] = value;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.payload = payload;
    }
  };
}

test("records unknown license activation attempts", { concurrency: false }, async () => {
  const originalDbUrl = process.env.DATABASE_URL;
  const originalPepper = process.env.QDS_LICENSE_PEPPER;
  const queries = [];

  process.env.DATABASE_URL = "postgres://example.test/qds";
  process.env.QDS_LICENSE_PEPPER = "p".repeat(32);
  globalThis[poolKey] = {
    async connect() {
      return {
        async query(sql, params) {
          queries.push([sql, params]);
          if (sql === "BEGIN" || sql === "COMMIT") return { rowCount: null, rows: [] };
          if (sql.includes("FROM licenses")) return { rowCount: 0, rows: [] };
          return { rowCount: 1, rows: [] };
        },
        release() {}
      };
    }
  };

  try {
    const response = createResponse();
    await handler({
      method: "POST",
      body: {
        license_key: "QDS-AB12-CD34",
        device_id: "0123456789abcdef0123456789abcdef",
        product: "quantum-dither-synth"
      }
    }, response);

    const hash = licenseHash("QDS-AB12-CD34", process.env.QDS_LICENSE_PEPPER);
    const insert = queries.find(([sql]) => sql.includes("INSERT INTO activation_events"));

    assert.deepEqual(insert?.[1], [hash, null, "0123456789abcdef0123456789abcdef", false, "license_not_found"]);
    assert.equal(response.statusCode, 403);
    assert.deepEqual(response.payload, { valid: false, product: "quantum-dither-synth" });
  } finally {
    if (originalDbUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = originalDbUrl;
    if (originalPepper === undefined) delete process.env.QDS_LICENSE_PEPPER;
    else process.env.QDS_LICENSE_PEPPER = originalPepper;
    delete globalThis[poolKey];
  }
});

test("records successful activations with linked hash", { concurrency: false }, async () => {
  const originalDbUrl = process.env.DATABASE_URL;
  const originalPepper = process.env.QDS_LICENSE_PEPPER;
  const queries = [];

  process.env.DATABASE_URL = "postgres://example.test/qds";
  process.env.QDS_LICENSE_PEPPER = "p".repeat(32);
  globalThis[poolKey] = {
    async connect() {
      return {
        async query(sql, params) {
          queries.push([sql, params]);
          if (sql === "BEGIN" || sql === "COMMIT") return { rowCount: null, rows: [] };
          if (sql.includes("FROM licenses")) {
            return { rowCount: 1, rows: [{ active: true, product: "quantum-dither-synth", device_id: null }] };
          }
          return { rowCount: 1, rows: [] };
        },
        release() {}
      };
    }
  };

  try {
    const response = createResponse();
    await handler({
      method: "POST",
      body: {
        license_key: "QDS-AB12-CD34",
        device_id: "0123456789abcdef0123456789abcdef",
        product: "quantum-dither-synth"
      }
    }, response);

    const hash = licenseHash("QDS-AB12-CD34", process.env.QDS_LICENSE_PEPPER);
    const insert = queries.find(([sql]) => sql.includes("INSERT INTO activation_events"));

    assert.deepEqual(insert?.[1], [hash, hash, "0123456789abcdef0123456789abcdef", true, "device_bound"]);
    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.payload, { valid: true, product: "quantum-dither-synth" });
  } finally {
    if (originalDbUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = originalDbUrl;
    if (originalPepper === undefined) delete process.env.QDS_LICENSE_PEPPER;
    else process.env.QDS_LICENSE_PEPPER = originalPepper;
    delete globalThis[poolKey];
  }
});
