import { pool } from "../lib/db.js";
import { getCatalog } from "../lib/catalog.js";
import { json, methodAllowed, readBody } from "../lib/http.js";
import { licenseHash, normalizeLicense, secretMatches, toBoolean } from "../lib/security.js";

const PRODUCT = process.env.QDS_PRODUCT_CODE || "quantum-dither-synth";

function allowedProduct(product) {
  if (product === PRODUCT) return true;
  try { return Boolean(getCatalog()[product]); } catch { return false; }
}

export default async function handler(request, response) {
  if (!methodAllowed(request, response, "POST")) return;
  if (!secretMatches(request)) return json(response, 401, { synced: false, error: "unauthorized" });

  const body = readBody(request);
  const licenseKey = normalizeLicense(body.license_key);
  const orderId = String(body.order_id ?? "").trim();
  const product = String(body.product ?? "").trim().toLowerCase();
  const active = toBoolean(body.active);
  const customerEmail = String(body.customer_email ?? "").trim().toLowerCase().slice(0, 320) || null;
  const resetDevice = toBoolean(body.reset_device) === true;

  if (!orderId || !allowedProduct(product) || active === null || (active && !licenseKey)) {
    return json(response, 400, { synced: false, error: "invalid_payload" });
  }

  try {
    if (!active) {
      const result = await pool.query(
        `UPDATE licenses
         SET active = FALSE, refunded_at = NOW(), updated_at = NOW()
         WHERE order_id = $1 AND product = $2`,
        [orderId, product]
      );
      if (result.rowCount !== 1) {
        return json(response, 404, { synced: false, error: "license_not_found" });
      }
      return json(response, 200, { synced: true, product, active: false });
    }

    const hash = licenseHash(licenseKey);
    await pool.query(
      `INSERT INTO licenses
        (license_hash, order_id, product, active, customer_email, device_id, refunded_at)
       VALUES ($1, $2, $3, $4, $5, NULL, $6)
       ON CONFLICT (order_id) DO UPDATE SET
         license_hash = EXCLUDED.license_hash,
         product = EXCLUDED.product,
         active = EXCLUDED.active,
         customer_email = EXCLUDED.customer_email,
         device_id = CASE WHEN $7 THEN NULL ELSE licenses.device_id END,
         refunded_at = EXCLUDED.refunded_at,
         updated_at = NOW()`,
      [hash, orderId, product, true, customerEmail, null, resetDevice]
    );
    return json(response, 200, { synced: true, product, active });
  } catch (error) {
    console.error("license sync failed", error?.code ?? "database_error");
    return json(response, 503, { synced: false, error: "database_unavailable" });
  }
}
