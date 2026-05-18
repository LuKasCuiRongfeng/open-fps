import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { test } from "node:test";
import { transpileTsModule } from "./helpers/transpile-ts.mjs";

const rootDirectory = path.resolve(import.meta.dirname, "..");

test("sidecar commit writes packs before the manifest and deletes stale packs after", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "open-fps-sidecar-"));
  try {
    const outputPath = await transpileTsModule(
      path.join(rootDirectory, "src/workspace/SidecarAssetCommit.ts"),
      tempRoot,
      (source) => source
        .replace(
          'import { uint8ArrayToBase64 } from "@/lib/base64";',
          'function uint8ArrayToBase64(bytes) { return Buffer.from(bytes).toString("base64"); }',
        )
        .replace(
          'import { getPlatform } from "@/platform";',
          'const getPlatform = () => globalThis.__sidecarTestPlatform;',
        ),
    );

    const operations = [];
    globalThis.__sidecarTestPlatform = {
      files: {
        async writeBinaryBase64(filePath, content) {
          operations.push({ type: "pack", filePath, content });
        },
        async writeText(filePath, content) {
          operations.push({ type: "manifest", filePath, content });
        },
        async deleteFile(filePath) {
          operations.push({ type: "delete", filePath });
        },
      },
    };

    const { commitSidecarAsset } = await import(pathToFileURL(outputPath).href);
    await commitSidecarAsset({
      mapDirectory: "/map",
      manifestPath: "paint/layers.json",
      manifestText: "{}",
      regions: [
        { key: "0,0", path: "paint/regions/r_0_0.paintpack", bytes: new Uint8Array([1, 2, 3]) },
        { key: "1,0", path: "paint/regions/r_1_0.paintpack", bytes: new Uint8Array([4, 5, 6]) },
      ],
      staleRegionPaths: ["paint/regions/r_0_0.paintpack", "paint/regions/r_old.paintpack"],
      staleDeleteLabel: "paint region",
    });

    const manifestIndex = operations.findIndex((operation) => operation.type === "manifest");
    const deleteIndex = operations.findIndex((operation) => operation.type === "delete");
    assert.equal(operations.filter((operation) => operation.type === "pack").length, 2);
    assert.ok(manifestIndex > 0, "manifest must be written after pack writes");
    assert.ok(deleteIndex > manifestIndex, "stale deletion must happen after manifest write");
    assert.deepEqual(
      operations.filter((operation) => operation.type === "delete").map((operation) => operation.filePath),
      ["/map/paint/regions/r_old.paintpack"],
    );
  } finally {
    delete globalThis.__sidecarTestPlatform;
    await rm(tempRoot, { recursive: true, force: true });
  }
});