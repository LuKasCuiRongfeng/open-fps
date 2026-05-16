import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const projectArg = process.argv[2] ?? "test_pro";
const projectDir = path.resolve(rootDir, projectArg);
const legacyMapPath = path.join(projectDir, "map.json");
const projectPath = path.join(projectDir, "project.json");
const generateAll = process.argv.includes("--all");
const mapFilter = readFlagValue("--map");

const chunkSizeMeters = 64;
const tileResolution = 64;
const defaultChunkBounds = {
  minChunkX: -8,
  maxChunkX: 7,
  minChunkZ: -8,
  maxChunkZ: 7,
};
const projectVersion = 3;
const mapVersion = 4;
const chunksDirectory = "terrain/chunks";
const heightFormat = "float32le";

const baseHeightConfig = {
  baseHeightMeters: 6,
  continental: {
    enabled: true,
    amplitudeMeters: 90,
    frequencyPerMeter: 0.00028,
    octaves: 2,
    lacunarity: 2,
    gain: 0.5,
    powerCurve: 2.35,
  },
  mountain: {
    enabled: true,
    amplitudeMeters: 135,
    frequencyPerMeter: 0.00085,
    octaves: 3,
    lacunarity: 2,
    gain: 0.5,
    powerCurve: 3.1,
  },
  hills: {
    enabled: true,
    amplitudeMeters: 20,
    frequencyPerMeter: 0.0032,
    octaves: 4,
    lacunarity: 2,
    gain: 0.5,
    powerCurve: 1.35,
  },
  detail: {
    enabled: true,
    amplitudeMeters: 5,
    frequencyPerMeter: 0.014,
    octaves: 3,
    lacunarity: 2,
    gain: 0.5,
  },
  valleys: {
    enabled: true,
    amplitudeMeters: 18,
    frequencyPerMeter: 0.0007,
    octaves: 2,
    heightFadeStartMeters: 42,
    heightFadeEndMeters: 90,
  },
  warp: {
    enabled: true,
    amplitudeMeters: 72,
    frequencyPerMeter: 0.0014,
  },
  erosion: {
    enabled: true,
    detailFrequency: 0.075,
    detailAmplitude: 1.2,
  },
};

const mapPresets = [
  {
    id: "main",
    name: "Frontier Basin",
    seed: 918273,
    shaper: "frontier-basin",
    chunkBounds: {
      minChunkX: -25,
      maxChunkX: 24,
      minChunkZ: -25,
      maxChunkZ: 24,
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
  {
    id: "ridge",
    name: "Ridgeline Siege",
    seed: 2112,
    shaper: "ridge",
    overrides: {
      baseHeightMeters: 12,
      mountain: { amplitudeMeters: 150, frequencyPerMeter: 0.00095 },
      valleys: { amplitudeMeters: 24 },
      warp: { amplitudeMeters: 58 },
    },
  },
  {
    id: "coast",
    name: "Coastal Crossfire",
    seed: 3779,
    shaper: "coast",
    overrides: {
      baseHeightMeters: 8,
      continental: { amplitudeMeters: 72 },
      mountain: { amplitudeMeters: 120 },
      hills: { amplitudeMeters: 15 },
      valleys: { amplitudeMeters: 14 },
    },
  },
  {
    id: "islands",
    name: "Island Gauntlet",
    seed: 4545,
    shaper: "islands",
    overrides: {
      baseHeightMeters: 5,
      continental: { amplitudeMeters: 58 },
      mountain: { amplitudeMeters: 105 },
      hills: { amplitudeMeters: 17 },
      warp: { amplitudeMeters: 82 },
    },
  },
];

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function smoothstep(edge0, edge1, value) {
  const t = clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

function quintic(value) {
  return value * value * value * (value * (value * 6 - 15) + 10);
}

function hash2i(xi, zi, seedOffset, seed) {
  let hash = Math.imul(xi | 0, 374761393);
  hash ^= Math.imul(zi | 0, 668265263);
  hash ^= Math.imul(Math.floor(seedOffset) | 0, 2147483647);
  hash ^= Math.imul(seed | 0, 1597334677);
  hash = Math.imul(hash ^ (hash >>> 13), 1274126177);
  return ((hash ^ (hash >>> 16)) >>> 0) / 4294967295;
}

function valueNoise2D(x, z, seedOffset, seed) {
  const xi = Math.floor(x);
  const zi = Math.floor(z);
  const xf = x - xi;
  const zf = z - zi;

  const u = quintic(xf);
  const v = quintic(zf);

  const a = hash2i(xi, zi, seedOffset, seed);
  const b = hash2i(xi + 1, zi, seedOffset, seed);
  const c = hash2i(xi, zi + 1, seedOffset, seed);
  const d = hash2i(xi + 1, zi + 1, seedOffset, seed);

  return lerp(lerp(a, b, u), lerp(c, d, u), v);
}

function fBm(worldX, worldZ, config, seedBase, seed, symmetric = false) {
  let sum = 0;
  let amplitude = 1;
  let frequency = config.frequencyPerMeter;
  let maxAmplitude = 0;

  for (let octave = 0; octave < config.octaves; octave += 1) {
    const n01 = valueNoise2D(worldX * frequency, worldZ * frequency, seedBase + octave * 1013, seed);
    const value = symmetric ? n01 * 2 - 1 : n01;
    sum += value * amplitude;
    maxAmplitude += amplitude;
    frequency *= config.lacunarity;
    amplitude *= config.gain;
  }

  const normalized = maxAmplitude > 0 ? sum / maxAmplitude : 0;
  const powerCurve = config.powerCurve ?? 1;
  return powerCurve === 1 ? normalized : Math.pow(Math.max(normalized, 0), powerCurve);
}

function pointToSegmentDistance(px, pz, ax, az, bx, bz) {
  const abx = bx - ax;
  const abz = bz - az;
  const apx = px - ax;
  const apz = pz - az;
  const denominator = abx * abx + abz * abz;
  const t = denominator > 0 ? clamp((apx * abx + apz * abz) / denominator, 0, 1) : 0;
  const closestX = ax + abx * t;
  const closestZ = az + abz * t;
  return Math.hypot(px - closestX, pz - closestZ);
}

function ridgeMask(x, z, ax, az, bx, bz, innerRadius, outerRadius) {
  const distance = pointToSegmentDistance(x, z, ax, az, bx, bz);
  return 1 - smoothstep(innerRadius, outerRadius, distance);
}

function radialMask(x, z, centerX, centerZ, innerRadius, outerRadius) {
  const distance = Math.hypot(x - centerX, z - centerZ);
  return 1 - smoothstep(innerRadius, outerRadius, distance);
}

function mixHeight(height, target, weight) {
  return lerp(height, target, clamp(weight, 0, 1));
}

function applyBattlegroundShaping(worldX, worldZ, height) {
  const mainMassif = radialMask(worldX, worldZ, 180, -20, 120, 380);
  const northRidge = ridgeMask(worldX, worldZ, -420, -210, 420, 220, 40, 200);
  const eastRidge = ridgeMask(worldX, worldZ, 120, -460, 430, 120, 35, 160);
  const westHighlands = radialMask(worldX, worldZ, -260, 90, 80, 280);
  const centerValley = ridgeMask(worldX, worldZ, -460, 240, 420, -200, 55, 220);
  const southPlain = radialMask(worldX, worldZ, 20, 300, 80, 360);
  const northSaddle = radialMask(worldX, worldZ, -40, -260, 50, 170);

  let shaped = height;
  shaped += mainMassif * 95;
  shaped += northRidge * 72;
  shaped += eastRidge * 48;
  shaped += westHighlands * 24;
  shaped -= centerValley * 32;
  shaped -= northSaddle * 18;

  const plainTarget = 10 + valueNoise2D(worldX * 0.003, worldZ * 0.003, 7100) * 8;
  shaped = mixHeight(shaped, plainTarget, southPlain * 0.58);

  const edgeDistance = Math.max(Math.abs(worldX), Math.abs(worldZ));
  const edgeFade = smoothstep(360, 540, edgeDistance);
  shaped = mixHeight(shaped, 8, edgeFade * 0.35);

  return shaped;
}

function applyFrontierBasinShaping(worldX, worldZ, height, seed) {
  const centralPrairie = radialMask(worldX, worldZ, -120, 80, 260, 980);
  const westHighlands = radialMask(worldX, worldZ, -1280, -180, 260, 980);
  const northeastRise = radialMask(worldX, worldZ, 980, -920, 220, 760);
  const southMesa = radialMask(worldX, worldZ, 760, 980, 180, 700);
  const northRidge = ridgeMask(worldX, worldZ, -1500, -1160, 1460, -700, 45, 260);
  const riverCorridor = ridgeMask(worldX, worldZ, -1520, -620, 1460, 560, 45, 240);
  const sideCreek = ridgeMask(worldX, worldZ, -820, 1180, 520, -1040, 35, 180);
  const broadSaddle = radialMask(worldX, worldZ, 260, -420, 120, 520);
  const edgeDistance = Math.max(Math.abs(worldX), Math.abs(worldZ));
  const horizonShoulder = smoothstep(1120, 1580, edgeDistance);
  const prairieNoise = valueNoise2D(worldX * 0.0026, worldZ * 0.0026, 7201, seed) * 2 - 1;
  const mesaNoise = valueNoise2D(worldX * 0.0011, worldZ * 0.0011, 7202, seed);
  const shoulderNoise = valueNoise2D(worldX * 0.0017, worldZ * 0.0017, 7203, seed);

  let shaped = height;
  shaped += westHighlands * 64;
  shaped += northeastRise * 48;
  shaped += southMesa * (36 + mesaNoise * 22);
  shaped += northRidge * 34;
  shaped += broadSaddle * 18;
  shaped -= riverCorridor * 24;
  shaped -= sideCreek * 12;

  const prairieTarget = 20 + prairieNoise * 6 + valueNoise2D(worldX * 0.006, worldZ * 0.006, 7204, seed) * 4;
  shaped = mixHeight(shaped, prairieTarget, centralPrairie * 0.58);
  shaped += horizonShoulder * (10 + shoulderNoise * 24);

  return shaped;
}

function applyRidgelineShaping(worldX, worldZ, height, seed) {
  const centralRidge = ridgeMask(worldX, worldZ, -520, -120, 520, 180, 35, 160);
  const rearRidge = ridgeMask(worldX, worldZ, -320, -420, 240, 420, 28, 120);
  const westBowl = radialMask(worldX, worldZ, -230, 40, 70, 240);
  const eastShelf = radialMask(worldX, worldZ, 290, -30, 80, 260);
  const saddle = ridgeMask(worldX, worldZ, -380, 260, 360, -220, 45, 170);

  let shaped = height;
  shaped += centralRidge * 105;
  shaped += rearRidge * 62;
  shaped += eastShelf * 24;
  shaped -= westBowl * 18;
  shaped -= saddle * 26;

  const basinNoise = valueNoise2D(worldX * 0.0025, worldZ * 0.0025, 7101, seed);
  shaped = mixHeight(shaped, 18 + basinNoise * 14, radialMask(worldX, worldZ, 20, 20, 40, 240) * 0.48);

  return shaped;
}

function applyCoastalShaping(worldX, worldZ, height, seed) {
  const coastMask = smoothstep(-180, 260, worldX + worldZ * 0.18);
  const inlandMassif = radialMask(worldX, worldZ, -180, -60, 120, 340);
  const coastalRidge = ridgeMask(worldX, worldZ, -420, 320, 320, -320, 30, 130);
  const harborBowl = radialMask(worldX, worldZ, 240, 150, 50, 210);

  let shaped = height;
  shaped += inlandMassif * 84;
  shaped += coastalRidge * 42;
  shaped -= harborBowl * 18;
  shaped = mixHeight(shaped, 6 + valueNoise2D(worldX * 0.003, worldZ * 0.003, 7102, seed) * 4, coastMask * 0.72);

  return shaped;
}

function applyIslandShaping(worldX, worldZ, height, seed) {
  const islandA = radialMask(worldX, worldZ, -240, -120, 70, 210);
  const islandB = radialMask(worldX, worldZ, 160, -40, 80, 240);
  const islandC = radialMask(worldX, worldZ, -20, 240, 60, 180);
  const islandBridge = ridgeMask(worldX, worldZ, -220, -90, 170, -20, 24, 90);
  const channels = ridgeMask(worldX, worldZ, -440, 20, 420, 120, 50, 180);

  let shaped = mixHeight(height, 3, 0.62);
  shaped += islandA * 92;
  shaped += islandB * 108;
  shaped += islandC * 74;
  shaped += islandBridge * 34;
  shaped -= channels * 26;
  shaped += valueNoise2D(worldX * 0.004, worldZ * 0.004, 7103, seed) * 6;

  return shaped;
}

function shapeHeight(worldX, worldZ, height, preset) {
  switch (preset.shaper) {
    case "frontier-basin":
      return applyFrontierBasinShaping(worldX, worldZ, height, preset.seed);
    case "ridge":
      return applyRidgelineShaping(worldX, worldZ, height, preset.seed);
    case "coast":
      return applyCoastalShaping(worldX, worldZ, height, preset.seed);
    case "islands":
      return applyIslandShaping(worldX, worldZ, height, preset.seed);
    case "highlands":
    default:
      return applyBattlegroundShaping(worldX, worldZ, height);
  }
}

function buildHeightConfig(preset) {
  const config = structuredClone(baseHeightConfig);
  for (const [section, value] of Object.entries(preset.overrides ?? {})) {
    if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      Object.assign(config[section], value);
      continue;
    }

    config[section] = value;
  }

  return config;
}

function generateHeight(worldX, worldZ, preset, heightConfig) {
  let warpedX = worldX;
  let warpedZ = worldZ;
  const seed = preset.seed;

  if (heightConfig.warp.enabled) {
    const warpFreq = heightConfig.warp.frequencyPerMeter;
    const warpAmp = heightConfig.warp.amplitudeMeters;
    const warpX = valueNoise2D(warpedX * warpFreq, warpedZ * warpFreq, 9001, seed) * 2 - 1;
    const warpZ = valueNoise2D(warpedX * warpFreq, warpedZ * warpFreq, 9002, seed) * 2 - 1;
    warpedX += warpX * warpAmp;
    warpedZ += warpZ * warpAmp;
  }

  let height = heightConfig.baseHeightMeters;

  if (heightConfig.continental.enabled) {
    height += fBm(warpedX, warpedZ, heightConfig.continental, 1000, seed) * heightConfig.continental.amplitudeMeters;
  }
  if (heightConfig.mountain.enabled) {
    height += fBm(warpedX, warpedZ, heightConfig.mountain, 2000, seed) * heightConfig.mountain.amplitudeMeters;
  }
  if (heightConfig.hills.enabled) {
    height += fBm(warpedX, warpedZ, heightConfig.hills, 3000, seed) * heightConfig.hills.amplitudeMeters;
  }
  if (heightConfig.detail.enabled) {
    height += fBm(warpedX, warpedZ, heightConfig.detail, 4000, seed, true) * heightConfig.detail.amplitudeMeters;
  }

  if (heightConfig.valleys.enabled) {
    const valleyNoise = fBm(warpedX, warpedZ, {
      frequencyPerMeter: heightConfig.valleys.frequencyPerMeter,
      octaves: heightConfig.valleys.octaves,
      lacunarity: 2,
      gain: 0.5,
    }, 5000, seed, true);
    const valleyShape = 1 - clamp(Math.abs(valleyNoise) * 2, 0, 1);
    const valleyDepth = valleyShape * valleyShape * heightConfig.valleys.amplitudeMeters;
    const fade = clamp(
      (height - heightConfig.valleys.heightFadeStartMeters) /
        (heightConfig.valleys.heightFadeEndMeters - heightConfig.valleys.heightFadeStartMeters),
      0,
      1,
    );
    height -= valleyDepth * (1 - fade);
  }

  if (heightConfig.erosion.enabled) {
    height +=
      fBm(
        warpedX,
        warpedZ,
        {
          frequencyPerMeter: heightConfig.erosion.detailFrequency,
          octaves: 2,
          lacunarity: 2,
          gain: 0.5,
        },
        6000,
        seed,
        true,
      ) * heightConfig.erosion.detailAmplitude;
  }

  height = shapeHeight(worldX, worldZ, height, preset);
  return clamp(height, 2, 255);
}

function createChunkHeights(cx, cz, preset, heightConfig) {
  const heights = new Float32Array(tileResolution * tileResolution);
  for (let z = 0; z < tileResolution; z += 1) {
    const localV = z / (tileResolution - 1);
    for (let x = 0; x < tileResolution; x += 1) {
      const localU = x / (tileResolution - 1);
      const worldX = cx * chunkSizeMeters + localU * chunkSizeMeters;
      const worldZ = cz * chunkSizeMeters + localV * chunkSizeMeters;
      heights[z * tileResolution + x] = generateHeight(worldX, worldZ, preset, heightConfig);
    }
  }
  return heights;
}

function chunkPathFor(cx, cz) {
  return `${chunksDirectory}/${formatChunkCoordinate(cx)}_${formatChunkCoordinate(cz)}.height.f32`;
}

function formatChunkCoordinate(value) {
  return value < 0 ? `m${Math.abs(value)}` : String(value);
}

async function readExistingProject() {
  try {
    const raw = await readFile(projectPath, "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function updateProjectMetadata(presets) {
  const now = Date.now();
  const existingProject = await readExistingProject();
  const created = existingProject?.created ?? now;
  const projectName = existingProject?.name ?? path.basename(projectDir);
  const existingMaps = Array.isArray(existingProject?.maps) ? existingProject.maps : [];
  const generatedMaps = new Map(presets.map((preset) => [preset.id, preset]));
  const existingIds = new Set(existingMaps.map((entry) => entry.id));

  const maps = existingMaps.map((entry) => {
    const preset = generatedMaps.get(entry.id);
    if (!preset) {
      return entry;
    }

    return {
      id: preset.id,
      name: preset.name,
      created: entry.created ?? created,
      modified: now,
    };
  });

  for (const preset of presets) {
    if (existingIds.has(preset.id)) {
      continue;
    }

    maps.push({
      id: preset.id,
      name: preset.name,
      created,
      modified: now,
    });
  }

  const project = {
    name: projectName,
    created,
    modified: now,
    version: projectVersion,
    currentMapId: maps.some((entry) => entry.id === existingProject?.currentMapId)
      ? existingProject.currentMapId
      : presets[0]?.id ?? "main",
    maps,
  };

  await writeFile(projectPath, `${JSON.stringify(project, null, 2)}\n`, "utf8");
}

async function clearMapAuthoringAssets(mapDir) {
  // EN: Terrain redesigns start clean; texture paint and vegetation are rebuilt after the height field stabilizes.
  // 中文: 地形重设计从干净状态开始；纹理绘制和植被会在高度场稳定后重刷。
  await Promise.all([
    rm(path.join(mapDir, "splatmap.png"), { force: true }),
    rm(path.join(mapDir, "texture.json"), { force: true }),
    rm(path.join(mapDir, "vegetation.json"), { force: true }),
    rm(path.join(mapDir, "vegetation"), { recursive: true, force: true }),
  ]);
}

function getChunkBounds(preset) {
  return preset.chunkBounds ?? defaultChunkBounds;
}

async function generateMap(preset) {
  const now = Date.now();
  const mapDir = path.join(projectDir, "maps", preset.id);
  const mapPath = path.join(mapDir, "map.json");
  const chunksDir = path.join(mapDir, chunksDirectory);
  const heightConfig = buildHeightConfig(preset);
  const bounds = getChunkBounds(preset);
  const chunkKeys = [];
  let minHeight = Number.POSITIVE_INFINITY;
  let maxHeight = Number.NEGATIVE_INFINITY;

  await clearMapAuthoringAssets(mapDir);
  await rm(chunksDir, { recursive: true, force: true });

  for (let cz = bounds.minChunkZ; cz <= bounds.maxChunkZ; cz += 1) {
    for (let cx = bounds.minChunkX; cx <= bounds.maxChunkX; cx += 1) {
      const heights = createChunkHeights(cx, cz, preset, heightConfig);
      for (const value of heights) {
        minHeight = Math.min(minHeight, value);
        maxHeight = Math.max(maxHeight, value);
      }

      const relativeChunkPath = chunkPathFor(cx, cz);
      const chunkFilePath = path.join(mapDir, relativeChunkPath);
      await mkdir(path.dirname(chunkFilePath), { recursive: true });
      await writeFile(chunkFilePath, Buffer.from(heights.buffer, heights.byteOffset, heights.byteLength));

      chunkKeys.push(`${cx},${cz}`);
    }
  }

  const mapData = {
    version: mapVersion,
    seed: preset.seed,
    tileResolution,
    chunkSizeMeters,
    heightFormat,
    chunksDirectory,
    chunkKeys,
    metadata: {
      name: preset.name,
      created: now,
      modified: now,
    },
  };

  await mkdir(mapDir, { recursive: true });
  await writeFile(mapPath, `${JSON.stringify(mapData, null, 2)}\n`, "utf8");

  return {
    id: preset.id,
    name: preset.name,
    mapPath,
    minHeight,
    maxHeight,
    chunkCount: chunkKeys.length,
    areaSquareKilometers: chunkKeys.length * chunkSizeMeters * chunkSizeMeters / 1_000_000,
  };
}

function selectPresets() {
  if (mapFilter) {
    const preset = mapPresets.find((entry) => entry.id === mapFilter);
    if (!preset) {
      throw new Error(`Unknown map preset '${mapFilter}'. Available presets: ${mapPresets.map((entry) => entry.id).join(", ")}`);
    }
    return [preset];
  }

  return generateAll ? mapPresets : [mapPresets[0]];
}

function readFlagValue(flag) {
  const index = process.argv.indexOf(flag);
  if (index >= 0 && index + 1 < process.argv.length) {
    return process.argv[index + 1];
  }

  return null;
}

async function main() {
  const presets = selectPresets();
  const results = [];

  for (const preset of presets) {
    results.push(await generateMap(preset));
  }

  await updateProjectMetadata(presets);
  await rm(legacyMapPath, { force: true });

  console.log(`Generated ${results.length} terrain map(s) for ${projectArg}`);
  for (const result of results) {
    console.log(`- ${result.id}: ${result.name}`);
    console.log(`  Chunks: ${result.chunkCount}`);
    console.log(`  Area: ${result.areaSquareKilometers.toFixed(2)} km^2`);
    console.log(`  Height range: ${result.minHeight.toFixed(2)}m .. ${result.maxHeight.toFixed(2)}m`);
    console.log(`  Map path: ${result.mapPath}`);
  }
}

main().catch((error) => {
  console.error("Failed to generate terrain map.");
  console.error(error);
  process.exitCode = 1;
});