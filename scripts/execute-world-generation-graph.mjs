import { createGenerationContext } from "./map-generation/shared.mjs";
import {
  assertRebuildPlanWithinBudget,
  createRebuildRequestFromArgs,
  createWorldRebuildPlanFromContext,
  formatRebuildPlanForConsole,
  readWorldGenerationGraph,
} from "./map-generation/world-rebuild-planner.mjs";
import { dispatchWorldGenerationStages } from "./map-generation/stage-executor-dispatcher.mjs";

async function main() {
  const context = createGenerationContext();
  const request = createRebuildRequestFromArgs(context.args);
  const dryRun = request.dryRun;
  const results = [];

  for (const preset of context.presets) {
    const graph = await readWorldGenerationGraph(context, preset);
    const rebuildPlan = await createWorldRebuildPlanFromContext(context, preset, request);
    if (!dryRun) {
      assertRebuildPlanWithinBudget(rebuildPlan, request);
    }

    const stages = await dispatchWorldGenerationStages(context, preset, graph, rebuildPlan, { dryRun });
    results.push({ preset, rebuildPlan, stages });
  }

  console.log(`${dryRun ? "Planned" : "Executed"} world generation graph for ${results.length} map(s) in ${context.projectArg}`);
  for (const result of results) {
    console.log(formatRebuildPlanForConsole(result.rebuildPlan));
    for (const stage of result.stages) {
      console.log(`  - ${stage.stage}: ${stage.status} by ${stage.executor} (${stage.keyCount} keys)`);
    }
  }
}

main().catch((error) => {
  console.error("Failed to execute world generation graph.");
  console.error(error);
  process.exitCode = 1;
});
