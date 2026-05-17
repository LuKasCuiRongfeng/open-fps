import { createGenerationContext, removeLegacyProjectMap, updateProjectMetadata } from "./map-generation/shared.mjs";
import { generateVegetationAssets } from "./map-generation/vegetation-assets.mjs";

async function main() {
  const context = createGenerationContext();
  const results = [];

  for (const preset of context.presets) {
    results.push(await generateVegetationAssets(context, preset));
  }

  await updateProjectMetadata(context, context.presets);
  await removeLegacyProjectMap(context);

  console.log(`Generated vegetation for ${results.length} map(s) in ${context.projectArg}`);
  for (const result of results) {
    console.log(`- ${result.id}: ${result.name}`);
    console.log(`  Vegetation models: ${result.modelCount}`);
    console.log(`  Vegetation instances: ${result.instanceCount} in ${result.cellCount} cells / ${result.regionCount} regions`);
  }
}

main().catch((error) => {
  console.error("Failed to generate vegetation assets.");
  console.error(error);
  process.exitCode = 1;
});
