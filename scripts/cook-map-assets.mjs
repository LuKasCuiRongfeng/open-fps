import { generateCookedMapAssets } from "./map-generation/cooked-assets.mjs";
import { createGenerationContext } from "./map-generation/shared.mjs";
import {
  createRebuildRequestFromArgs,
  createWorldRebuildPlanFromContext,
  formatRebuildPlanForConsole,
  hasRebuildRequest,
} from "./map-generation/world-rebuild-planner.mjs";

async function main() {
  const context = createGenerationContext();
  const rebuildRequest = createRebuildRequestFromArgs(context.args);
  const usesRebuildPlan = hasRebuildRequest(rebuildRequest);
  const results = [];

  for (const preset of context.presets) {
    const rebuildPlan = usesRebuildPlan
      ? await createWorldRebuildPlanFromContext(context, preset, rebuildRequest)
      : null;
    if (rebuildRequest.dryRun && rebuildPlan) {
      results.push({ preset, rebuildPlan, cooked: null });
      continue;
    }

    results.push({
      preset,
      rebuildPlan,
      cooked: await generateCookedMapAssets(context, preset, { rebuildPlan }),
    });
  }

  console.log(`${rebuildRequest.dryRun ? "Planned" : "Generated"} cooked map data for ${results.length} map(s) in ${context.projectArg}`);
  for (const result of results) {
    if (result.rebuildPlan) {
      console.log(formatRebuildPlanForConsole(result.rebuildPlan));
    }
    if (!result.cooked) {
      continue;
    }

    const cacheLabel = result.cooked.cacheHit ? "cache hit" : "rebuilt";
    console.log(`- ${result.cooked.mapId}: ${result.cooked.cellCount} world partition cells (${cacheLabel})`);
    console.log(`  Generated cell assets: objects=${result.cooked.objectCellCount}, collision=${result.cooked.collisionCellCount}, nav=${result.cooked.navCellCount}`);
    console.log(`  Cooked package artifacts: ${result.cooked.artifactCount}`);
    console.log(`  Cooked manifest: ${result.cooked.path}`);
  }
}

main().catch((error) => {
  console.error("Failed to generate cooked map data.");
  console.error(error);
  process.exitCode = 1;
});