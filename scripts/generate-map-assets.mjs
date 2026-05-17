import { generatePaintAssets } from "./map-generation/paint-assets.mjs";
import { createGenerationContext, removeLegacyProjectMap, updateProjectMetadata } from "./map-generation/shared.mjs";
import { generateTerrainAssets } from "./map-generation/terrain-assets.mjs";
import { generateVegetationAssets } from "./map-generation/vegetation-assets.mjs";

async function main() {
  const context = createGenerationContext();
  const results = [];

  for (const preset of context.presets) {
    const terrain = await generateTerrainAssets(context, preset);
    const paint = await generatePaintAssets(context, preset);
    const vegetation = await generateVegetationAssets(context, preset);
    results.push({ preset, terrain, paint, vegetation });
  }

  await updateProjectMetadata(context, context.presets, { touch: true });
  await removeLegacyProjectMap(context);

  console.log(`Generated all map assets for ${results.length} map(s) in ${context.projectArg}`);
  for (const result of results) {
    console.log(`- ${result.preset.id}: ${result.preset.name}`);
    console.log(`  Height pages: ${result.terrain.pageCount}`);
    console.log(`  Height regions: ${result.terrain.regionCount}`);
    console.log(`  Paint layers: ${result.paint.layerCount}`);
    console.log(`  Vegetation instances: ${result.vegetation.instanceCount} in ${result.vegetation.cellCount} cells / ${result.vegetation.regionCount} regions`);
    console.log(`  Area: ${result.terrain.areaSquareKilometers.toFixed(2)} km^2`);
    console.log(`  Height range: ${result.terrain.minHeight.toFixed(2)}m .. ${result.terrain.maxHeight.toFixed(2)}m`);
    console.log(`  Map path: ${result.terrain.mapPath}`);
  }
}

main().catch((error) => {
  console.error("Failed to generate map assets.");
  console.error(error);
  process.exitCode = 1;
});
