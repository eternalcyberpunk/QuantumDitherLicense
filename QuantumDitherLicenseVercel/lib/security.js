import crypto from "node:crypto";

export function normalizeLicense(value) {
  const normalized = String(value ?? "").trim().toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9-]{5,127}$/.test(normalized)) return null;
  return normalized;
}

export function normalizeDevice(value) {
  const normalized = String(value ?? "").trim().toLowerCase();
  return /^[a-f0-9]{32}$/.test(normalized) ? normalized : null;
}

export function licenseHash(licenseKey, pepper = process.env.QDS_LICENSE_PEPPER) {
  if (!pepper || pepper.length < 32) throw new Error("QDS_LICENSE_PEPPER is not securely configured");
  return crypto.createHmac("sha256", pepper).update(licenseKey, "utf8").digest("hex");
}

export function secretMatches(request) {
  const configured = process.env.QDS_SYNC_SECRET ?? "";
  const authorization = String(request.headers.authorization ?? "");
  const bearer = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  const supplied = String(request.headers["x-qds-sync-secret"] ?? bearer);
  if (configured.length < 32 || supplied.length !== configured.length) return false;
  return crypto.timingSafeEqual(Buffer.from(supplied), Buffer.from(configured));
}

export function toBoolean(value) {
  if (value === true || value === 1) return true;
  if (value === false || value === 0) return false;
  const text = String(value ?? "").trim().toLowerCase();
  if (["true", "1", "yes", "active"].includes(text)) return true;
  if (["false", "0", "no", "inactive", "refunded"].includes(text)) return false;
  return null;
}
