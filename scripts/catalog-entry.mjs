import { createHash } from "node:crypto";
import { createReadStream, statSync } from "node:fs";
import { basename } from "node:path";

const [file, source, installType] = process.argv.slice(2);
if (!file || !source || !["msi", "pkg"].includes(installType)) {
  console.error("Usage: node scripts/catalog-entry.mjs FILE HTTPS_URL_OR_BLOB_PATH msi|pkg");
  process.exit(2);
}
const location = source.startsWith("https://") ? { url: new URL(source).toString() } : { blob_path: source };
const hash = createHash("sha256");
for await (const chunk of createReadStream(file)) hash.update(chunk);
console.log(JSON.stringify({
  ...location, file_name: basename(file), install_type: installType,
  sha256: hash.digest("hex"), size_bytes: statSync(file).size,
}, null, 2));
