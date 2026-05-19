#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { brotliDecompress } from "node:zlib";

const brotliDecompressAsync = promisify(brotliDecompress);
const rootDirectory = path.resolve(import.meta.dirname, "..");
const args = process.argv.slice(2);
const projectDirectory = path.resolve(rootDirectory, readArgValue("--project") ?? "kunlun_wilds");
const mapId = readArgValue("--map") ?? "main";
const sampleCount = Number(readArgValue("--samples") ?? 16);
const manifestPath = path.join(projectDirectory, "cooked/maps", mapId, "manifest.json");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));

if (manifest.package?.streaming?.compression !== "brotli-sidecar-v1") {
    throw new Error("Cooked package does not declare Brotli sidecar streaming.");
}

const compressedArtifacts = Object.entries(manifest.package?.artifacts ?? {})
    .filter(([, artifact]) => artifact?.compression?.algorithm === "brotli");
if (compressedArtifacts.length === 0) {
    throw new Error("Cooked package has no compressed artifacts to smoke-test.");
}

const overBudgetCells = (manifest.partition?.cells ?? []).filter((cell) => cell?.budget?.rating === "over");
if (overBudgetCells.length > 0) {
    throw new Error(`Cooked package has ${overBudgetCells.length} over-budget partition cell(s).`);
}

let checkedBytes = 0;
for (const [runtimePath, artifact] of compressedArtifacts.slice(0, Math.max(1, sampleCount))) {
    const compressedPath = path.join(projectDirectory, artifact.compression.blobPath);
    const compressedBytes = await readFile(compressedPath);
    assertSha256(compressedBytes, artifact.compression.sha256, `${runtimePath} compressed sha256`);
    if (compressedBytes.byteLength !== artifact.compression.byteLength) {
        throw new Error(`${runtimePath} compressed byteLength ${compressedBytes.byteLength} != ${artifact.compression.byteLength}`);
    }

    const decompressedBytes = await brotliDecompressAsync(compressedBytes);
    assertSha256(decompressedBytes, artifact.sha256, `${runtimePath} raw sha256`);
    if (decompressedBytes.byteLength !== artifact.byteLength) {
        throw new Error(`${runtimePath} raw byteLength ${decompressedBytes.byteLength} != ${artifact.byteLength}`);
    }
    checkedBytes += decompressedBytes.byteLength;
}

console.log(`[smoke-release-package] OK: ${Math.min(sampleCount, compressedArtifacts.length)} compressed artifacts, ${checkedBytes} decompressed bytes.`);

function readArgValue(flag) {
    const index = args.indexOf(flag);
    if (index >= 0) {
        return args[index + 1];
    }

    const inline = args.find((arg) => arg.startsWith(`${flag}=`));
    return inline ? inline.slice(flag.length + 1) : null;
}

function assertSha256(bytes, expected, label) {
    const actual = createHash("sha256").update(bytes).digest("hex");
    if (actual !== expected) {
        throw new Error(`${label} mismatch`);
    }
}
