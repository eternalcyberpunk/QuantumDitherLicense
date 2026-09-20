export function json(response, status, payload) {
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  response.status(status).json(payload);
}

export function readBody(request) {
  if (request.body && typeof request.body === "object") return request.body;
  if (typeof request.body !== "string") return {};
  try {
    return JSON.parse(request.body);
  } catch {
    return Object.fromEntries(new URLSearchParams(request.body));
  }
}

export function methodAllowed(request, response, method) {
  if (request.method === method) return true;
  response.setHeader("Allow", method);
  json(response, 405, { error: "method_not_allowed" });
  return false;
}
