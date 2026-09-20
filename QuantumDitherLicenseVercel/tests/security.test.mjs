import test from "node:test";
import assert from "node:assert/strict";
import { licenseHash, normalizeDevice, normalizeLicense, secretMatches, toBoolean } from "../lib/security.js";

test("normalizes valid license keys", () => {
  assert.equal(normalizeLicense(" qds-ab12-cd34 "), "QDS-AB12-CD34");
  assert.equal(normalizeLicense("bad key"), null);
});

test("accepts only the plugin device format", () => {
  assert.equal(normalizeDevice("0123456789ABCDEF0123456789ABCDEF"), "0123456789abcdef0123456789abcdef");
  assert.equal(normalizeDevice("device-1"), null);
});

test("hashes licenses deterministically without storing plaintext", () => {
  const pepper = "a".repeat(64);
  const first = licenseHash("QDS-AB12-CD34", pepper);
  assert.equal(first, licenseHash("QDS-AB12-CD34", pepper));
  assert.notEqual(first, licenseHash("QDS-AB12-CD35", pepper));
  assert.equal(first.length, 64);
});

test("parses Zapier boolean values", () => {
  assert.equal(toBoolean("true"), true);
  assert.equal(toBoolean("refunded"), false);
  assert.equal(toBoolean("maybe"), null);
});

test("matches sync secrets from header or bearer auth", { concurrency: false }, () => {
  const original = process.env.QDS_SYNC_SECRET;
  process.env.QDS_SYNC_SECRET = "s".repeat(32);

  try {
    assert.equal(secretMatches({ headers: { "x-qds-sync-secret": "s".repeat(32) } }), true);
    assert.equal(secretMatches({ headers: { authorization: "Bearer " + "s".repeat(32) } }), true);
  } finally {
    process.env.QDS_SYNC_SECRET = original;
  }
});

test("rejects mismatched or weak sync secrets", { concurrency: false }, () => {
  const original = process.env.QDS_SYNC_SECRET;

  try {
    process.env.QDS_SYNC_SECRET = "s".repeat(32);
    assert.equal(secretMatches({ headers: { "x-qds-sync-secret": "t".repeat(32) } }), false);

    process.env.QDS_SYNC_SECRET = "short-secret";
    assert.equal(secretMatches({ headers: { "x-qds-sync-secret": "short-secret" } }), false);
  } finally {
    process.env.QDS_SYNC_SECRET = original;
  }
});
