const PRODUCT_PATTERN = /^[a-z0-9][a-z0-9_-]{1,63}$/;
const VERSION_PATTERN = /^[0-9]+(?:\.[0-9]+){1,3}(?:[-+][A-Za-z0-9.-]+)?$/;
const HASH_PATTERN = /^[a-f0-9]{64}$/;
const FILE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._ -]{0,127}$/;
const PROFILE_PATTERN = /^(?:qds-v1|ec-v1)$/;
const ARTIFACT_KEY_PATTERN = /^(?:windows-(?:x64|arm64)|macos-(?:x64|arm64|universal))$/;

let cachedSource = null;
let cachedCatalog = null;

function text(value, name, maximum) {
  if (typeof value !== "string") throw new Error(`catalog_${name}_invalid`);
  const clean = value.trim();
  if (!clean || clean.length > maximum) throw new Error(`catalog_${name}_invalid`);
  return clean;
}

function parseArtifact(value, key) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`catalog_artifact_${key}_invalid`);
  }
  const hasUrl = typeof value.url === "string" && value.url.trim().length > 0;
  const hasBlobPath = typeof value.blob_path === "string" && value.blob_path.trim().length > 0;
  if (hasUrl === hasBlobPath) throw new Error(`catalog_artifact_${key}_source_invalid`);
  let url = null;
  let blobPath = null;
  if (hasUrl) {
    const urlText = text(value.url, "url", 2048);
    try { url = new URL(urlText); } catch { throw new Error(`catalog_artifact_${key}_url_invalid`); }
    if (url.protocol !== "https:" || url.username || url.password || url.hash) {
      throw new Error(`catalog_artifact_${key}_url_invalid`);
    }
  } else {
    blobPath = text(value.blob_path, "blob_path", 512);
    if (!/^[A-Za-z0-9][A-Za-z0-9._/-]{0,511}$/.test(blobPath) ||
        blobPath.includes("..") || blobPath.startsWith("/") || blobPath.endsWith("/")) {
      throw new Error(`catalog_artifact_${key}_blob_path_invalid`);
    }
  }
  const fileName = text(value.file_name, "file_name", 128);
  if (!FILE_PATTERN.test(fileName) || fileName.includes("..")) {
    throw new Error(`catalog_artifact_${key}_file_name_invalid`);
  }
  const installType = text(value.install_type, "install_type", 16).toLowerCase();
  if ((key.startsWith("windows-") && installType !== "msi") ||
      (key.startsWith("macos-") && installType !== "pkg")) {
    throw new Error(`catalog_artifact_${key}_install_type_invalid`);
  }
  const sha256 = text(value.sha256, "sha256", 64).toLowerCase();
  if (!HASH_PATTERN.test(sha256)) throw new Error(`catalog_artifact_${key}_sha256_invalid`);
  const sizeBytes = Number(value.size_bytes);
  if (!Number.isSafeInteger(sizeBytes) || sizeBytes < 1 || sizeBytes > 2_147_483_648) {
    throw new Error(`catalog_artifact_${key}_size_invalid`);
  }
  return Object.freeze({
    ...(url ? { url: url.toString() } : { blob_path: blobPath }),
    file_name: fileName,
    install_type: installType,
    sha256,
    size_bytes: sizeBytes,
  });
}

export async function materializeArtifact(artifact) {
  let url = artifact.url;
  if (!url) {
    const { issueSignedToken, presignUrl } = await import("@vercel/blob");
    const validUntil = Date.now() + 10 * 60 * 1000;
    const token = await issueSignedToken({
      pathname: artifact.blob_path,
      operations: ["get"],
      validUntil,
    });
    const signed = await presignUrl(token, {
      operation: "get",
      pathname: artifact.blob_path,
      access: "private",
      validUntil,
    });
    url = signed.presignedUrl;
  }
  return {
    url,
    file_name: artifact.file_name,
    install_type: artifact.install_type,
    sha256: artifact.sha256,
    size_bytes: artifact.size_bytes,
  };
}

export function parseCatalog(source) {
  if (typeof source !== "string" || !source.trim()) throw new Error("catalog_not_configured");
  let input;
  try { input = JSON.parse(source); } catch { throw new Error("catalog_json_invalid"); }
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("catalog_root_invalid");

  const output = {};
  for (const [rawProduct, value] of Object.entries(input)) {
    const product = rawProduct.trim().toLowerCase();
    if (!PRODUCT_PATTERN.test(product) || product !== rawProduct) throw new Error("catalog_product_invalid");
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`catalog_${product}_invalid`);
    const displayName = text(value.display_name, "display_name", 100);
    const version = text(value.version, "version", 40);
    if (!VERSION_PATTERN.test(version)) throw new Error(`catalog_${product}_version_invalid`);
    const licenseProfile = text(value.license_profile, "license_profile", 24);
    if (!PROFILE_PATTERN.test(licenseProfile)) throw new Error(`catalog_${product}_profile_invalid`);
    if (!value.artifacts || typeof value.artifacts !== "object" || Array.isArray(value.artifacts)) {
      throw new Error(`catalog_${product}_artifacts_invalid`);
    }
    const artifacts = {};
    for (const [key, artifact] of Object.entries(value.artifacts)) {
      if (!ARTIFACT_KEY_PATTERN.test(key)) throw new Error(`catalog_artifact_key_${key}_invalid`);
      artifacts[key] = parseArtifact(artifact, key);
    }
    if (Object.keys(artifacts).length === 0) throw new Error(`catalog_${product}_artifacts_empty`);
    output[product] = Object.freeze({ display_name: displayName, version, license_profile: licenseProfile,
      artifacts: Object.freeze(artifacts) });
  }
  if (Object.keys(output).length === 0) throw new Error("catalog_empty");
  return Object.freeze(output);
}

export function getCatalog() {
  const source = process.env.EC_INSTALLER_CATALOG_JSON ?? "";
  if (source !== cachedSource) {
    cachedCatalog = parseCatalog(source);
    cachedSource = source;
  }
  return cachedCatalog;
}

export function normalizeTarget(platformValue, archValue) {
  const platform = String(platformValue ?? "").trim().toLowerCase();
  const arch = String(archValue ?? "").trim().toLowerCase();
  if (!['windows', 'macos'].includes(platform) || !['x64', 'arm64'].includes(arch)) return null;
  return { platform, arch };
}

export function selectProduct(catalog, product, target) {
  const item = catalog[product];
  if (!item) return null;
  const candidates = target.platform === "macos"
    ? [`macos-${target.arch}`, "macos-universal"]
    : [`windows-${target.arch}`];
  const key = candidates.find((candidate) => item.artifacts[candidate]);
  if (!key) return null;
  return { product, display_name: item.display_name, version: item.version,
    license_profile: item.license_profile, artifact: item.artifacts[key] };
}
