import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  clamp,
  ensureMapManifestPaths,
  getMapDir,
  hash2i,
  paintManifestPath,
  paintPageResolution,
  paintPagesDirectory,
} from "./shared.mjs";

export async function generatePaintAssets(context, preset) {
  const mapDir = getMapDir(context, preset);
  const paintDir = path.join(mapDir, "paint");
  await ensureMapManifestPaths(context, preset, { paintPath: paintManifestPath });
  await rm(paintDir, { recursive: true, force: true });
  await mkdir(path.join(paintDir, "pages"), { recursive: true });

  const layers = {
    beachSand: {
      diffuse: "assets/texture/aerial_beach_01_diff_1k.jpg",
      normal: "assets/texture/aerial_beach_01_nor_gl_1k.png",
      arm: "assets/texture/aerial_beach_01_arm_1k.png",
      displacement: "assets/texture/aerial_beach_01_disp_1k.png",
      scale: 7,
      splatMapIndex: 0,
    },
    mudLeaves: {
      diffuse: "assets/texture/brown_mud_leaves_01_diff_1k.jpg",
      normal: "assets/texture/brown_mud_leaves_01_nor_gl_1k.png",
      arm: "assets/texture/brown_mud_leaves_01_arm_1k.png",
      displacement: "assets/texture/brown_mud_leaves_01_disp_1k.png",
      scale: 5,
      splatMapIndex: 0,
    },
  };
  const manifest = {
    version: 1,
    layers,
    splatMaps: {
      format: "rgba8-splat-v1",
      resolution: paintPageResolution,
      directory: paintPagesDirectory,
      indices: [0],
    },
  };

  await writeFile(path.join(paintDir, "layers.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

  const pixels = Buffer.alloc(paintPageResolution * paintPageResolution * 4);
  for (let pixelZ = 0; pixelZ < paintPageResolution; pixelZ += 1) {
    for (let pixelX = 0; pixelX < paintPageResolution; pixelX += 1) {
      const normalizedX = pixelX / (paintPageResolution - 1);
      const normalizedZ = pixelZ / (paintPageResolution - 1);
      const grain = hash2i(Math.floor(normalizedX * 96), Math.floor(normalizedZ * 96), 8123, 918273);
      const broad = 0.5 + 0.5 * Math.sin(normalizedX * 18 + Math.cos(normalizedZ * 9) * 1.6);
      const mudWeight = clamp(0.18 + broad * 0.28 + grain * 0.22, 0, 1);
      const mudByte = Math.round(mudWeight * 255);
      const offset = (pixelZ * paintPageResolution + pixelX) * 4;
      pixels[offset] = 255 - mudByte;
      pixels[offset + 1] = mudByte;
      pixels[offset + 2] = 0;
      pixels[offset + 3] = 0;
    }
  }

  await writeFile(path.join(paintDir, "pages", "splat_0.paint.rgba"), pixels);
  return {
    id: preset.id,
    name: preset.name,
    layerCount: Object.keys(layers).length,
    splatByteLength: pixels.byteLength,
  };
}
