import { pool } from "../lib/db.js";
import { json, methodAllowed, readBody } from "../lib/http.js";
import { licenseHash, normalizeDevice, normalizeLicense } from "../lib/security.js";

async function recordEvent(client, hash, deviceId, accepted, reason) {
  await client.query(
    `INSERT INTO activation_events (license_hash, device_id, accepted, reason)
     VALUES ($1, $2, $3, $4)`,
    [hash, deviceId, accepted, reason]
  );
}

export default async function handler(request, response) {
  if (!methodAllowed(request, response, "POST")) return;
  const body = readBody(request);
  const licenseKey = normalizeLicense(body.license_key);
  const deviceId = normalizeDevice(body.device_id);
  const product = String(body.product ?? "").trim().toLowerCase();

  if (!licenseKey || !deviceId || !/^[a-z0-9][a-z0-9_-]{1,63}$/.test(product)) {
    return json(response, 400, { valid: false, product });
  }

  let client;
  try {
    const hash = licenseHash(licenseKey);
    client = await pool.connect();
    await client.query("BEGIN");
    const result = await client.query(
      `SELECT active, product, device_id
       FROM licenses
       WHERE license_hash = $1
       FOR UPDATE`,
      [hash]
    );

    if (result.rowCount !== 1) {
      await client.query("COMMIT");
      return json(response, 403, { valid: false, product });
    }

    if (!result.rows[0].active || result.rows[0].product !== product) {
      await recordEvent(client, hash, deviceId, false, "invalid_or_inactive");
      await client.query("COMMIT");
      return json(response, 403, { valid: false, product });
    }

    const storedDevice = result.rows[0].device_id;
    if (storedDevice && storedDevice !== deviceId) {
      await recordEvent(client, hash, deviceId, false, "device_mismatch");
      await client.query("COMMIT");
      return json(response, 403, { valid: false, product });
    }

    if (!storedDevice) {
      await client.query(
        "UPDATE licenses SET device_id = $1, updated_at = NOW() WHERE license_hash = $2",
        [deviceId, hash]
      );
    }
    await recordEvent(client, hash, deviceId, true, storedDevice ? "device_match" : "device_bound");
    await client.query("COMMIT");
    return json(response, 200, { valid: true, product });
  } catch (error) {
    if (client) {
      try { await client.query("ROLLBACK"); } catch { /* connection is already unusable */ }
    }
    console.error("activation failed", error?.code ?? "database_error");
    return json(response, 503, { valid: false, product });
  } finally {
    client?.release();
  }
}
