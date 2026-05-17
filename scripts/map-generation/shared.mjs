import { readFile, rm, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const rootDir = path.resolve(__dirname, "..", "..");

export const pageSizeMeters = 64;
export const heightPageResolution = 129;
export const projectVersion = 3;
export const mapVersion = 8;
export const terrainHeightPath = "terrain/height/manifest.json";
export const terrainHeightManifestVersion = 1;
export const heightRegionsDirectory = "terrain/height/regions";
export const heightRegionFormat = "height-region-pack-v1";
export const heightSampleFormat = "float32le";
export const heightRegionSizePages = 8;
export const paintManifestPath = "paint/layers.json";
export const paintRegionsDirectory = "paint/regions";
export const paintRegionFormat = "rgba8-splat-region-pack-v1";
export const paintRegionSizePages = 8;
export const paintPageResolution = 32;
export const vegetationModelsPath = "vegetation/models.json";
export const vegetationRegionsDirectory = "vegetation/regions";
export const vegetationRegionFormat = "vegetation-region-pack-v1";
export const vegetationInstanceFormat = "instanced-f32le-v1";
export const vegetationCellSizeMeters = 32;
export const vegetationRegionSizeCells = 8;
export const vegetationInstanceRecordByteLength = 24;
export const vegetationRegionPackMagic = 0x31475256;
export const vegetationRegionPackVersion = 1;
export const vegetationRegionPackHeaderByteLength = 8;
export const vegetationRegionPackEntryByteLength = 8;
export const cookedMapsDirectory = "cooked/maps";
export const cookedMapManifestFile = "manifest.json";
export const cookedMapFormat = "open-fps-cooked-map-v2";
export const cookedMapVersion = 2;
export const cookedWorldPartitionCellSizePages = 8;
export const cookedWorldPartitionDependencyKinds = ["terrain", "paint", "vegetation", "objects", "collision", "nav"];

export const defaultPageBounds = {
  minPageX: -8,
  maxPageX: 7,
  minPageZ: -8,
  maxPageZ: 7,
};

export const mapPresets = [
  {
    id: "main",
    name: "Frontier Basin",
    seed: 918273,
    shaper: "frontier-basin",
    pageBounds: {
      minPageX: -25,
      maxPageX: 24,
      minPageZ: -25,
      maxPageZ: 24,
    },
    overrides: {
      baseHeightMeters: 10,
      continental: { amplitudeMeters: 72, frequencyPerMeter: 0.00022, powerCurve: 2.1 },
      mountain: { amplitudeMeters: 82, frequencyPerMeter: 0.00058, powerCurve: 2.75 },
      hills: { amplitudeMeters: 24, frequencyPerMeter: 0.0021, powerCurve: 1.25 },
      detail: { amplitudeMeters: 4.5, frequencyPerMeter: 0.012 },
      valleys: { amplitudeMeters: 20, frequencyPerMeter: 0.00052, heightFadeStartMeters: 34, heightFadeEndMeters: 86 },
      warp: { amplitudeMeters: 120, frequencyPerMeter: 0.00095 },
      erosion: { detailFrequency: 0.055, detailAmplitude: 1.0 },
    },
  },
];

export function createGenerationContext(args = process.argv.slice(2)) {
  const projectArg = readProjectArg(args);
  const projectDir = path.resolve(rootDir, projectArg);
  const mapFilter = readFlagValue(args, "--map");
  const generateAll = args.includes("--all");
  const presets = selectPresets(mapFilter, generateAll);

  return {
    args,
    projectArg,
    projectDir,
    projectPath: path.join(projectDir, "project.json"),
    legacyMapPath: path.join(projectDir, "map.json"),
    mapFilter,
    generateAll,
    presets,
  };
}

export function getMapDir(context, preset) {
  return path.join(context.projectDir, "maps", preset.id);
}

export function getMapPath(context, preset) {
  return path.join(getMapDir(context, preset), "map.json");
}

export function getPageBounds(preset) {
  return preset.pageBounds ?? defaultPageBounds;
}

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function hash2i(xi, zi, seedOffset, seed) {
  let hash = Math.imul(xi | 0, 374761393);
  hash ^= Math.imul(zi | 0, 668265263);
  hash ^= Math.imul(Math.floor(seedOffset) | 0, 2147483647);
  hash ^= Math.imul(seed | 0, 1597334677);
  hash = Math.imul(hash ^ (hash >>> 13), 1274126177);
  return ((hash ^ (hash >>> 16)) >>> 0) / 4294967295;
}

export function formatGridCoordinate(value) {
  return value < 0 ? `m${Math.abs(value)}` : String(value);
}

export function compareRegionCoords(left, right) {
  return left.z - right.z || left.x - right.x;
}

export async function readJsonFile(filePath) {
  try {
    const raw = await readFile(filePath, "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function readMapManifest(context, preset) {
  return readJsonFile(getMapPath(context, preset));
}

export async function ensureMapManifestPaths(context, preset, paths) {
  const mapPath = getMapPath(context, preset);
  const manifest = await readJsonFile(mapPath);
  if (!manifest) {
    throw new Error(`Map manifest is missing for '${preset.id}'. Run pnpm gen:terrain -- --map ${preset.id} first.`);
  }

  let changed = false;
  for (const [key, value] of Object.entries(paths)) {
    if (manifest[key] !== value) {
      manifest[key] = value;
      changed = true;
    }
  }

  if (!changed) {
    return false;
  }

  manifest.metadata = {
    ...manifest.metadata,
    modified: Date.now(),
  };
  await writeJsonFile(mapPath, manifest);
  return true;
}

export async function updateProjectMetadata(context, presets, options = {}) {
  const now = Date.now();
  const existingProject = await readJsonFile(context.projectPath);
  const created = existingProject?.created ?? now;
  const projectName = existingProject?.name ?? path.basename(context.projectDir);
  const existingMaps = Array.isArray(existingProject?.maps)
    ? existingProject.maps.filter((entry) => typeof entry === "string" && entry.trim().length > 0)
    : [];
  const maps = [...new Set(existingMaps)];

  for (const preset of presets) {
    if (!maps.includes(preset.id)) {
      maps.push(preset.id);
    }
  }

  const currentMapId = maps.includes(existingProject?.currentMapId)
    ? existingProject.currentMapId
    : presets[0]?.id ?? "main";
  const structureChanged = !existingProject
    || existingProject.name !== projectName
    || existingProject.created !== created
    || existingProject.version !== projectVersion
    || existingProject.currentMapId !== currentMapId
    || JSON.stringify(existingMaps) !== JSON.stringify(maps);

  if (!structureChanged && !options.touch) {
    return false;
  }

  await writeJsonFile(context.projectPath, {
    name: projectName,
    created,
    modified: options.touch ? now : existingProject?.modified ?? now,
    version: projectVersion,
    currentMapId,
    maps,
  });
  return true;
}

export async function removeLegacyProjectMap(context) {
  await rm(context.legacyMapPath, { force: true });
}

export async function writeJsonFile(filePath, value) {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export function createRegionIntegrity(bytes) {
  return {
    byteLength: bytes.byteLength,
    sha256: createSha256Hex(bytes),
  };
}

export function createSha256Hex(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function selectPresets(mapFilter, generateAll) {
  if (mapFilter) {
    const preset = mapPresets.find((entry) => entry.id === mapFilter);
    if (!preset) {
      throw new Error(`Unknown map preset '${mapFilter}'. Available presets: ${mapPresets.map((entry) => entry.id).join(", ")}`);
    }
    return [preset];
  }

  return generateAll ? mapPresets : [mapPresets[0]];
}

function readFlagValue(args, flag) {
  const inlinePrefix = `${flag}=`;
  const inlineValue = args.find((arg) => arg.startsWith(inlinePrefix));
  if (inlineValue) {
    return inlineValue.slice(inlinePrefix.length);
  }

  const index = args.indexOf(flag);
  if (index >= 0 && index + 1 < args.length) {
    return args[index + 1];
  }

  return null;
}

function readProjectArg(args) {
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--map") {
      index += 1;
      continue;
    }

    if (arg === "--all" || arg.startsWith("--map=")) {
      continue;
    }

    if (!arg.startsWith("--")) {
      return arg;
    }
  }

  return "test_pro";
}
