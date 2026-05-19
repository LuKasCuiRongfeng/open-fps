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
    assert.equal(pack.targetDetails[0].stage, "terrain");
    assert.equal(pack.targetDetails[0].scopeKey, "terrainRegions");
    assert.equal(pack.targetDetails[0].scopeValue, "0,0");

    const graph = helpers.analyzeCookText("Unknown world generation stage 'foo'", false);
    assert.equal(graph.category, "graph");

    const environment = helpers.analyzeCookText("Failed to run cook map command: pnpm not found", false);
    assert.equal(environment.category, "environment");
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("rebuild console routes validation targets into sections and recovery requests", async () => {
  const { helpers, tempRoot } = await importConsoleHelpers();
  try {
    const target = helpers.createCookTarget("cooked/maps/main/nav/cells/c_m1_2.navpack");
    assert.equal(target.sectionId, "world-debug-partition-runtime");
    assert.equal(target.stage, "nav");
    assert.equal(target.scopeKey, "partitionCells");
    assert.equal(target.scopeValue, "-1,2");

    const request = helpers.createTargetRecoveryRequest("kunlun_wilds", "main", target, true);
    assert.equal(request.full, false);
    assert.deepEqual(request.changedStages, ["nav"]);
    assert.deepEqual(request.scopes.partitionCells, ["-1,2"]);
    assert.equal(request.dryRun, true);

    const graphTarget = helpers.createCookTarget("maps/main/generation/graph.json");
    const fullRequest = helpers.createTargetRecoveryRequest("kunlun_wilds", "main", graphTarget, true);
    assert.equal(fullRequest.full, true);
    assert.deepEqual(fullRequest.changedStages, []);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("rebuild console creates history recovery actions from failed cook entries", async () => {
  const { helpers, tempRoot } = await importConsoleHelpers();
  try {
    const request = {
      projectPath: "kunlun_wilds",
      mapId: "main",
      dryRun: false,
      full: false,
      changedStages: ["collision"],
      scopes: {
        terrainRegions: [],
        paintRegions: [],
        vegetationRegions: [],
        partitionCells: ["0,0"],
      },
    };
    const running = helpers.createRunningCookEntry("cook-test", "cook", request, 100);
    const failed = helpers.failCookEntry(running, "cooked/maps/main/collision/cells/c_0_0.collisionpack missing", 200);
    const actions = helpers.createCookRecoveryActions(failed).map((action) => action.kind);
    assert.deepEqual(actions, ["refreshDiagnostics", "copyTargets", "retryDryRun", "retryCook", "fullDryRun"]);

    const dryRun = helpers.createEntryRecoveryRequest(failed, "retryDryRun");
    assert.equal(dryRun.dryRun, true);
    assert.equal(dryRun.full, false);
    const fullDryRun = helpers.createEntryRecoveryRequest(failed, "fullDryRun");
    assert.equal(fullDryRun.dryRun, true);
    assert.equal(fullDryRun.full, true);
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
    assert.equal(queue[0].blockedReason, null);
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

    const blockedQueue = helpers.createCookQueue(request, [], "Estimated artifacts 80 exceeds scoped limit 64");
    assert.equal(blockedQueue[0].status, "queued");
    assert.equal(blockedQueue[1].status, "blocked");
    assert.equal(blockedQueue[1].blockedReason, "Estimated artifacts 80 exceeds scoped limit 64");
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("rebuild console blocks queued jobs that intersect locked scopes", async () => {
  const { helpers, tempRoot } = await importConsoleHelpers();
  try {
    const request = {
      projectPath: "kunlun_wilds",
      mapId: "main",
      dryRun: false,
      full: false,
      changedStages: ["objects"],
      scopes: {
        terrainRegions: [],
        paintRegions: [],
        vegetationRegions: [],
        partitionCells: ["0,0", "1,0"],
      },
    };
    const locks = helpers.normalizeRebuildLocks({
      partitionCells: ["1,0", "bad", "0,0", "0,0"],
      terrainRegions: ["2,0"],
    });

    assert.deepEqual(locks.partitionCells, ["0,0", "1,0"]);
    const conflicts = helpers.createLockConflicts(request, locks);
    assert.equal(conflicts.length, 1);
    assert.equal(conflicts[0].key, "partitionCells");
    assert.deepEqual(conflicts[0].values, ["0,0", "1,0"]);

    const queue = helpers.createCookQueue(request, conflicts);
    assert.equal(queue[0].status, "blocked");
    assert.equal(queue[1].status, "blocked");
    assert.match(queue[0].blockedReason, /Cells 0,0, 1,0/);

    const fullConflicts = helpers.createLockConflicts({ ...request, full: true, scopes: { terrainRegions: [], paintRegions: [], vegetationRegions: [], partitionCells: [] } }, locks);
    assert.equal(fullConflicts.length, 2);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});