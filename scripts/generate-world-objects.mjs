#!/usr/bin/env node
import { createGenerationContext } from "./map-generation/shared.mjs";
import { generateWorldObjectAssets } from "./map-generation/world-object-assets.mjs";

async function main() {
  const context = createGenerationContext();
  const results = [];

  for (const preset of context.presets) {
    results.push(await generateWorldObjectAssets(context, preset));
  }

  console.log(`Generated world object assets for ${results.length} map(s) in ${context.projectArg}`);
  for (const result of results) {
    console.log(`- ${result.id}: ${result.objectCount} objects across ${result.cellCount} partition cells`);
  }
}

main().catch((error) => {
  console.error("Failed to generate world object assets.");
  console.error(error);
  process.exitCode = 1;
});