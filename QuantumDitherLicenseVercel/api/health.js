import { pool } from "../lib/db.js";
import { json, methodAllowed } from "../lib/http.js";

export default async function handler(request, response) {
  if (!methodAllowed(request, response, "GET")) return;
  try {
    await pool.query("SELECT 1");
    return json(response, 200, { ok: true, service: "quantum-dither-license" });
  } catch {
    return json(response, 503, { ok: false, service: "quantum-dither-license" });
  }
}
