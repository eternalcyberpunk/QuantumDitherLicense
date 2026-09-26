import assert from "node:assert/strict";
import test from "node:test";
import { materializeArtifact, normalizeTarget, parseCatalog, selectProduct } from "../lib/catalog.js";

const hash = "a".repeat(64);
const source = JSON.stringify({
  "quantum-dither-synth": {
    display_name: "Quantum Dither Synth",
    version: "1.3.0",
    license_profile: "qds-v1",
    artifacts: {
      "windows-x64": {
        url: "https://downloads.example.net/QuantumDitherSynth-1.3.0.msi",
        file_name: "QuantumDitherSynth-1.3.0.msi",
        install_type: "msi",
        sha256: hash,
        size_bytes: 1234,
      },
      "macos-universal": {
        url: "https://downloads.example.net/QuantumDitherSynth-1.3.0.pkg",
        file_name: "QuantumDitherSynth-1.3.0.pkg",
        install_type: "pkg",
        sha256: hash,
        size_bytes: 4321,
      },
    },
  },
});

test("catalog selects the exact Windows artifact", () => {
  const selected = selectProduct(parseCatalog(source), "quantum-dither-synth",
    normalizeTarget("windows", "x64"));
  assert.equal(selected.artifact.install_type, "msi");
});

test("catalog falls back to a universal macOS package", () => {
  const selected = selectProduct(parseCatalog(source), "quantum-dither-synth",
    normalizeTarget("macos", "arm64"));
  assert.equal(selected.artifact.install_type, "pkg");
});

test("catalog rejects HTTP artifact URLs", () => {
  const bad = source.replace("https://", "http://");
  assert.throws(() => parseCatalog(bad), /url_invalid/);
});

test("catalog accepts a private Blob pathname", () => {
  const value = JSON.parse(source);
  const artifact = value["quantum-dither-synth"].artifacts["windows-x64"];
  delete artifact.url;
  artifact.blob_path = "releases/QuantumDitherSynth-1.3.0-Windows.msi";
  const selected = selectProduct(parseCatalog(JSON.stringify(value)), "quantum-dither-synth",
    normalizeTarget("windows", "x64"));
  assert.equal(selected.artifact.blob_path, artifact.blob_path);
});

test("catalog rejects a filename traversal", () => {
  const bad = source.replace(
    '"file_name":"QuantumDitherSynth-1.3.0.msi"',
    '"file_name":"../bad.msi"'
  );
  assert.throws(() => parseCatalog(bad), /file_name_invalid/);
});

test("target validation rejects unsupported architectures", () => {
  assert.equal(normalizeTarget("windows", "x86"), null);
});

test("materializeArtifact returns direct URL artifacts unchanged", async () => {
  const artifact = {
    url: "https://downloads.example.net/QuantumDitherSynth-1.3.0.msi",
    file_name: "QuantumDitherSynth-1.3.0.msi",
    install_type: "msi",
    sha256: hash,
    size_bytes: 1234,
  };
  const resolved = await materializeArtifact(artifact);
  assert.deepEqual(resolved, artifact);
});

test("materializeArtifact signs private blob artifacts", async () => {
  const artifact = {
    blob_path: "releases/QuantumDitherSynth-1.3.0-Windows.msi",
    file_name: "QuantumDitherSynth-1.3.0.msi",
    install_type: "msi",
    sha256: hash,
    size_bytes: 1234,
  };
  const signer = {
    async issueSignedToken({ pathname, operations, validUntil }) {
      assert.equal(pathname, artifact.blob_path);
      assert.deepEqual(operations, ["get"]);
      assert.equal(typeof validUntil, "number");
      return "signed-token";
    },
    async presignUrl(token, { pathname, operation, access, validUntil }) {
      assert.equal(token, "signed-token");
      assert.equal(pathname, artifact.blob_path);
      assert.equal(operation, "get");
      assert.equal(access, "private");
      assert.equal(typeof validUntil, "number");
      return { presignedUrl: "https://blob.example.net/signed-download" };
    },
  };
  const resolved = await materializeArtifact(artifact, signer);
  assert.deepEqual(resolved, {
    url: "https://blob.example.net/signed-download",
    file_name: artifact.file_name,
    install_type: artifact.install_type,
    sha256: artifact.sha256,
    size_bytes: artifact.size_bytes,
  });
});
