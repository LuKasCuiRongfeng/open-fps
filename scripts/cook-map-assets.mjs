import { generateCookedMapAssets } from "./map-generation/cooked-assets.mjs";
import { createGenerationContext } from "./map-generation/shared.mjs";

async function main() {
  const context = createGenerationContext();
  const results = [];

  for (const preset of context.presets) {
    results.push(await generateCookedMapAssets(context, preset));
  }

  console.log(`Generated cooked map data for ${results.length} map(s) in ${context.projectArg}`);
  for (const result of results) {
    console.log(`- ${result.mapId}: ${result.cellCount} world partition cells`);
    console.log(`  Cooked manifest: ${result.path}`);
  }
}

main().catch((error) => {
  console.error("Failed to generate cooked map data.");
  console.error(error);
  process.exitCode = 1;
});