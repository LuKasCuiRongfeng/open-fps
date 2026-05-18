import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { test } from "node:test";
import { transpileTsModule } from "./helpers/transpile-ts.mjs";

const rootDirectory = path.resolve(import.meta.dirname, "..");

async function importConsoleHelpers() {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "open-fps-rebuild-console-"));
  const outputPath = await transpileTsModule(
    path.join(rootDirectory, "src/editor/ui/settings/tabs/worldDebugRebuildConsole.ts"),
    tempRoot,
  );
  const helpers = await import(pathToFileURL(outputPath).href);
  return { helpers, tempRoot };
}

test("rebuild console classifies cook failures by actionable category", async () => {
  const { helpers, tempRoot } = await importConsoleHelpers();
  try {
    const pack = helpers.analyzeCookText("terrain/height/regions/r_0_0.heightpack sha256 mismatch", false);
    assert.equal(pack.category, "pack");
    assert.equal(pack.label, "Pack Integrity");
    assert.deepEqual(pack.targets, ["terrain/height/regions/r_0_0.heightpack"]);

    const graph = helpers.analyzeCookText("Unknown world generation stage 'foo'", false);
    assert.equal(graph.category, "graph");

    const environment = helpers.analyzeCookText("Failed to run cook map command: pnpm not found", false);
    assert.equal(environment.category, "environment");
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("rebuild console builds review-first queue and compact scope summaries", async () => {
  const { helpers, tempRoot } = await importConsoleHelpers();
  try {
    const request = {
      projectPath: "kunlun_wilds",
      mapId: "main",
      dryRun: false,
      full: false,
      changedStages: ["collision"],
      scopes: {
        terrainRegions: ["0,0"],
        paintRegions: [],
        vegetationRegions: [],
        partitionCells: ["0,0"],
      },
    };

    const queue = helpers.createCookQueue(request);
    assert.equal(queue.length, 2);
    assert.equal(queue[0].kind, "dryRun");
    assert.equal(queue[0].request.dryRun, true);
    assert.equal(queue[1].kind, "cook");
    assert.equal(queue[1].request.dryRun, false);

    const summaries = helpers.summarizePlanScopes({
      scopes: {
        terrainRegions: ["0,0", "1,0", "2,0", "3,0", "4,0", "5,0"],
        paintRegions: [],
        vegetationRegions: [],
        partitionCells: ["0,0"],
      },
    });
    assert.equal(summaries[0].sample, "0,0, 1,0, 2,0, 3,0, 4,0 +1");
    assert.equal(summaries[3].sample, "0,0");
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});