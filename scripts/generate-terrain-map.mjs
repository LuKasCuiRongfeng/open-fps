import { createGenerationContext, removeLegacyProjectMap, updateProjectMetadata } from "./map-generation/shared.mjs";
import { generateTerrainAssets } from "./map-generation/terrain-assets.mjs";

async function main() {
  const context = createGenerationContext();
  const results = [];

  for (const preset of context.presets) {
    results.push(await generateTerrainAssets(context, preset));
  }

  await updateProjectMetadata(context, context.presets, { touch: true });
  await removeLegacyProjectMap(context);

  console.log(`Generated terrain for ${results.length} map(s) in ${context.projectArg}`);
  for (const result of results) {
    console.log(`- ${result.id}: ${result.name}`);
    console.log(`  Height pages: ${result.pageCount}`);
    console.log(`  Height regions: ${result.regionCount}`);
    console.log(`  Area: ${result.areaSquareKilometers.toFixed(2)} km^2`);
    console.log(`  Height range: ${result.minHeight.toFixed(2)}m .. ${result.maxHeight.toFixed(2)}m`);
    console.log(`  Map path: ${result.mapPath}`);
  }
}

main().catch((error) => {
  console.error("Failed to generate terrain assets.");
  console.error(error);
  process.exitCode = 1;
});
