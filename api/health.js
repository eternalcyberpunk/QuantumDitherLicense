import { pool } from "../lib/db.js";
import { getCatalog } from "../lib/catalog.js";
import { json, methodAllowed } from "../lib/http.js";

export default async function handler(request, response) {
  if (!methodAllowed(request, response, "GET")) return;
  try {
    await pool.query("SELECT 1");
    let installerReady = false;
    try { installerReady = Object.keys(getCatalog()).length > 0; } catch { /* catalog is optional for plug-in checks */ }
    return json(response, 200, {
      ok: true,
      service: "quantum-dither-license",
      installer_ready: installerReady,
    });
  } catch {
    return json(response, 503, { ok: false, service: "quantum-dither-license" });
  }
}
