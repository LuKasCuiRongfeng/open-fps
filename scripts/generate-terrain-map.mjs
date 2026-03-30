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
const chunkMin = -8;
const chunkMax = 7;

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
    name: "Battleground Highlands",
    seed: 1337,
    shaper: "highlands",
    overrides: {},
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
  const heights = new Array(tileResolution * tileResolution);
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

function encodeHeightsBase64(heights) {
  const float32 = new Float32Array(heights);
  return Buffer.from(float32.buffer).toString("base64");
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

  const project = {
    name: projectName,
    created,
    modified: now,
    version: 2,
    currentMapId: presets[0]?.id ?? "main",
    maps: presets.map((preset) => ({
      id: preset.id,
      name: preset.name,
      created,
      modified: now,
    })),
  };

  await writeFile(projectPath, `${JSON.stringify(project, null, 2)}\n`, "utf8");
}

async function generateMap(preset) {
  const now = Date.now();
  const mapDir = path.join(projectDir, "maps", preset.id);
  const mapPath = path.join(mapDir, "map.json");
  const heightConfig = buildHeightConfig(preset);
  const chunks = {};
  let minHeight = Number.POSITIVE_INFINITY;
  let maxHeight = Number.NEGATIVE_INFINITY;

  for (let cz = chunkMin; cz <= chunkMax; cz += 1) {
    for (let cx = chunkMin; cx <= chunkMax; cx += 1) {
      const heights = createChunkHeights(cx, cz, preset, heightConfig);
      for (const value of heights) {
        minHeight = Math.min(minHeight, value);
        maxHeight = Math.max(maxHeight, value);
      }
      chunks[`${cx},${cz}`] = {
        heightsBase64: encodeHeightsBase64(heights),
      };
    }
  }

  const mapData = {
    version: 2,
    seed: preset.seed,
    tileResolution,
    chunkSizeMeters,
    chunks,
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
    chunkCount: (chunkMax - chunkMin + 1) ** 2,
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
    console.log(`  Height range: ${result.minHeight.toFixed(2)}m .. ${result.maxHeight.toFixed(2)}m`);
    console.log(`  Map path: ${result.mapPath}`);
  }
}

main().catch((error) => {
  console.error("Failed to generate terrain map.");
  console.error(error);
  process.exitCode = 1;
});