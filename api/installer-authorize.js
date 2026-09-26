import { pool } from "../lib/db.js";
import { getCatalog, materializeArtifact, normalizeTarget, selectProduct } from "../lib/catalog.js";
import { json, methodAllowed, readBody } from "../lib/http.js";
import { licenseHash, normalizeDevice, normalizeLicense } from "../lib/security.js";

async function recordEvent(client, attemptedHash, linkedHash, deviceId, accepted, reason) {
  await client.query(
    `INSERT INTO activation_events (attempted_hash, license_hash, device_id, accepted, reason)
     VALUES ($1, $2, $3, $4, $5)`,
    [attemptedHash, linkedHash, deviceId, accepted, reason]
  );
}

export default async function handler(request, response) {
  if (!methodAllowed(request, response, "POST")) return;
  const body = readBody(request);
  const licenseKey = normalizeLicense(body.license_key);
  const deviceId = normalizeDevice(body.device_id);
  const requestedProduct = String(body.product ?? "").trim().toLowerCase();
  const target = normalizeTarget(body.platform, body.arch);
  if (!licenseKey || !deviceId || !requestedProduct || !target) {
    return json(response, 400, { authorized: false });
  }

  let client;
  let transactionOpen = false;
  try {
    const hash = licenseHash(licenseKey);
    client = await pool.connect();
    await client.query("BEGIN");
    transactionOpen = true;
    const result = await client.query(
      `SELECT active, product, license_profile, device_id
       FROM licenses
       WHERE license_hash = $1
       FOR UPDATE`,
      [hash]
    );
    if (result.rowCount !== 1 || !result.rows[0].active || result.rows[0].product !== requestedProduct) {
      await recordEvent(client, hash, result.rowCount === 1 ? hash : null, deviceId, false, "installer_invalid");
      await client.query("COMMIT");
      transactionOpen = false;
      return json(response, 403, { authorized: false });
    }

    const selected = selectProduct(getCatalog(), requestedProduct, target);
    if (!selected) {
      await recordEvent(client, hash, hash, deviceId, false, "installer_artifact_missing");
      await client.query("COMMIT");
      transactionOpen = false;
      return json(response, 403, { authorized: false });
    }
    if (result.rows[0].license_profile !== selected.license_profile) {
      await recordEvent(client, hash, hash, deviceId, false, "installer_profile_mismatch");
      await client.query("COMMIT");
      transactionOpen = false;
      return json(response, 403, { authorized: false });
    }

    const storedDevice = result.rows[0].device_id;
    if (storedDevice && storedDevice !== deviceId) {
      await recordEvent(client, hash, hash, deviceId, false, "installer_device_mismatch");
      await client.query("COMMIT");
      transactionOpen = false;
      return json(response, 403, { authorized: false });
    }
    if (!storedDevice) {
      await client.query(
        `UPDATE licenses SET device_id = $1, updated_at = NOW() WHERE license_hash = $2`,
        [deviceId, hash]
      );
    }
    await recordEvent(client, hash, hash, deviceId, true,
      storedDevice ? "installer_device_match" : "installer_device_bound");
    await client.query("COMMIT");
    transactionOpen = false;
    const artifact = await materializeArtifact(selected.artifact);
    return json(response, 200, {
      authorized: true,
      product: selected.product,
      display_name: selected.display_name,
      version: selected.version,
      license_profile: selected.license_profile,
      artifact,
    });
  } catch (error) {
    if (client && transactionOpen) {
      try { await client.query("ROLLBACK"); } catch { /* connection is unusable */ }
    }
    console.error("installer authorization failed", error?.message ?? "server_error");
    return json(response, 503, { authorized: false, error: "service_unavailable" });
  } finally {
    client?.release();
  }
}
