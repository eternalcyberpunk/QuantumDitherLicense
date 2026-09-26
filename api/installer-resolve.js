import { pool } from "../lib/db.js";
import { getCatalog, normalizeTarget, selectProduct } from "../lib/catalog.js";
import { json, methodAllowed, readBody } from "../lib/http.js";
import { licenseHash, normalizeLicense } from "../lib/security.js";

export default async function handler(request, response) {
  if (!methodAllowed(request, response, "POST")) return;
  const body = readBody(request);
  const licenseKey = normalizeLicense(body.license_key);
  const target = normalizeTarget(body.platform, body.arch);
  if (!licenseKey || !target) return json(response, 400, { eligible: false });

  try {
    const result = await pool.query(
      `SELECT active, product FROM licenses WHERE license_hash = $1`,
      [licenseHash(licenseKey)]
    );
    if (result.rowCount !== 1 || !result.rows[0].active) {
      return json(response, 403, { eligible: false });
    }
    const selected = selectProduct(getCatalog(), result.rows[0].product, target);
    if (!selected) return json(response, 403, { eligible: false });
    return json(response, 200, {
      eligible: true,
      product: selected.product,
      display_name: selected.display_name,
      version: selected.version,
      license_profile: selected.license_profile,
    });
  } catch (error) {
    console.error("installer resolve failed", error?.message ?? "server_error");
    return json(response, 503, { eligible: false, error: "service_unavailable" });
  }
}
