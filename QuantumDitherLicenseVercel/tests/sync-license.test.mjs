import test from "node:test";
import assert from "node:assert/strict";

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

test("sync handler honors the configured product code", { concurrency: false }, async () => {
  const originalDbUrl = process.env.DATABASE_URL;
  const originalSecret = process.env.QDS_SYNC_SECRET;
  const originalPepper = process.env.QDS_LICENSE_PEPPER;
  const originalProduct = process.env.QDS_PRODUCT_CODE;
  const queries = [];

  process.env.DATABASE_URL = "postgres://example.test/qds";
  process.env.QDS_SYNC_SECRET = "s".repeat(32);
  process.env.QDS_LICENSE_PEPPER = "p".repeat(32);
  process.env.QDS_PRODUCT_CODE = "custom-product";
  globalThis[poolKey] = {
    async query(sql, params) {
      queries.push([sql, params]);
      return { rowCount: 1, rows: [] };
    }
  };

  try {
    const { default: handler } = await import(new URL(`../api/sync-license.js?case=${Date.now()}`, import.meta.url));

    const okResponse = createResponse();
    await handler({
      method: "POST",
      headers: { "x-qds-sync-secret": "s".repeat(32) },
      body: {
        license_key: "QDS-AB12-CD34",
        order_id: "order-1",
        customer_email: "test@example.com",
        product: "custom-product",
        active: true,
        reset_device: false
      }
    }, okResponse);

    const badResponse = createResponse();
    await handler({
      method: "POST",
      headers: { "x-qds-sync-secret": "s".repeat(32) },
      body: {
        license_key: "QDS-AB12-CD34",
        order_id: "order-2",
        customer_email: "test@example.com",
        product: "quantum-dither-synth",
        active: true,
        reset_device: false
      }
    }, badResponse);

    assert.equal(okResponse.statusCode, 200);
    assert.deepEqual(okResponse.payload, { synced: true, product: "custom-product", active: true });
    assert.equal(badResponse.statusCode, 400);
    assert.deepEqual(badResponse.payload, { synced: false, error: "invalid_payload" });
    assert.equal(queries.length, 1);
  } finally {
    if (originalDbUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = originalDbUrl;
    if (originalSecret === undefined) delete process.env.QDS_SYNC_SECRET;
    else process.env.QDS_SYNC_SECRET = originalSecret;
    if (originalPepper === undefined) delete process.env.QDS_LICENSE_PEPPER;
    else process.env.QDS_LICENSE_PEPPER = originalPepper;
    if (originalProduct === undefined) delete process.env.QDS_PRODUCT_CODE;
    else process.env.QDS_PRODUCT_CODE = originalProduct;
    delete globalThis[poolKey];
  }
});
