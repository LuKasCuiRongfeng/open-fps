import { createGenerationContext, removeLegacyProjectMap, updateProjectMetadata } from "./map-generation/shared.mjs";
import { generatePaintAssets } from "./map-generation/paint-assets.mjs";

async function main() {
  const context = createGenerationContext();
  const results = [];

  for (const preset of context.presets) {
    results.push(await generatePaintAssets(context, preset));
  }

  await updateProjectMetadata(context, context.presets);
  await removeLegacyProjectMap(context);

  console.log(`Generated paint for ${results.length} map(s) in ${context.projectArg}`);
  for (const result of results) {
    console.log(`- ${result.id}: ${result.name}`);
    console.log(`  Paint layers: ${result.layerCount}`);
    console.log(`  Splat bytes: ${result.splatByteLength}`);
  }
}

main().catch((error) => {
  console.error("Failed to generate paint assets.");
  console.error(error);
  process.exitCode = 1;
});
