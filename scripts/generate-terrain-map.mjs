import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const cliArgs = process.argv.slice(2);
const projectArg = readProjectArg();
const projectDir = path.resolve(rootDir, projectArg);
const legacyMapPath = path.join(projectDir, "map.json");
const projectPath = path.join(projectDir, "project.json");
const generateAll = cliArgs.includes("--all");
const mapFilter = readFlagValue("--map");

const pageSizeMeters = 64;
const heightPageResolution = 129;
const defaultPageBounds = {
  minPageX: -8,
  maxPageX: 7,
  minPageZ: -8,
  maxPageZ: 7,
};
const projectVersion = 3;
const mapVersion = 8;
const terrainHeightPath = "terrain/height/manifest.json";
const terrainHeightManifestVersion = 1;
const heightRegionsDirectory = "terrain/height/regions";
const heightRegionFormat = "height-region-pack-v1";
const heightSampleFormat = "float32le";
const heightRegionSizePages = 8;
const paintManifestPath = "paint/layers.json";
const paintPagesDirectory = "paint/pages";
const paintPageResolution = 1024;
const vegetationModelsPath = "vegetation/models.json";
const vegetationRegionsDirectory = "vegetation/regions";
const vegetationRegionFormat = "vegetation-region-pack-v1";
const vegetationInstanceFormat = "instanced-f32le-v1";
const vegetationCellSizeMeters = 32;
const vegetationRegionSizeCells = 8;
const vegetationInstanceRecordByteLength = 24;
const vegetationRegionPackMagic = 0x31475256;
const vegetationRegionPackVersion = 1;
const vegetationRegionPackHeaderByteLength = 8;
const vegetationRegionPackEntryByteLength = 8;

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

function shapeHeight(worldX, worldZ, height, preset) {
  if (preset.shaper !== "frontier-basin") {
    throw new Error(`Unsupported terrain shaper '${preset.shaper}'`);
  }

  return applyFrontierBasinShaping(worldX, worldZ, height, preset.seed);
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

function createHeightPage(px, pz, preset, heightConfig) {
  const heights = new Float32Array(heightPageResolution * heightPageResolution);
  for (let z = 0; z < heightPageResolution; z += 1) {
    const localV = z / (heightPageResolution - 1);
    for (let x = 0; x < heightPageResolution; x += 1) {
      const localU = x / (heightPageResolution - 1);
      const worldX = px * pageSizeMeters + localU * pageSizeMeters;
      const worldZ = pz * pageSizeMeters + localV * pageSizeMeters;
      heights[z * heightPageResolution + x] = generateHeight(worldX, worldZ, preset, heightConfig);
    }
  }
  return heights;
}

function heightRegionKey(rx, rz) {
  return `${rx},${rz}`;
}

function heightRegionPathFor(rx, rz) {
  return `${heightRegionsDirectory}/r_${formatGridCoordinate(rx)}_${formatGridCoordinate(rz)}.heightpack`;
}

function heightRegionCoordsForPage(px, pz) {
  return {
    x: Math.floor(px / heightRegionSizePages),
    z: Math.floor(pz / heightRegionSizePages),
  };
}

function comparePageKeys(left, right) {
  return heightRegionLocalPageIndex(left.px, left.pz) - heightRegionLocalPageIndex(right.px, right.pz);
}

function compareRegionCoords(left, right) {
  return left.z - right.z || left.x - right.x;
}

function heightRegionLocalPageIndex(px, pz) {
  const region = heightRegionCoordsForPage(px, pz);
  const localX = px - region.x * heightRegionSizePages;
  const localZ = pz - region.z * heightRegionSizePages;
  return localZ * heightRegionSizePages + localX;
}

function formatHeightRegionMask(mask) {
  return `0x${mask.toString(16).padStart(16, "0")}`;
}

function formatGridCoordinate(value) {
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
  const existingMaps = Array.isArray(existingProject?.maps)
    ? existingProject.maps.filter((entry) => typeof entry === "string" && entry.trim().length > 0)
    : [];
  const maps = [...new Set(existingMaps)];

  for (const preset of presets) {
    if (maps.includes(preset.id)) {
      continue;
    }

    maps.push(preset.id);
  }

  const project = {
    name: projectName,
    created,
    modified: now,
    version: projectVersion,
    currentMapId: maps.includes(existingProject?.currentMapId)
      ? existingProject.currentMapId
      : presets[0]?.id ?? "main",
    maps,
  };

  await writeFile(projectPath, `${JSON.stringify(project, null, 2)}\n`, "utf8");
}

async function clearMapAuthoringAssets(mapDir) {
  // EN: Terrain regeneration starts clean; preview paint and vegetation are rebuilt against the new height field.
  // 中文: 地形重生成从干净状态开始；预览纹理与植被会基于新高度场重建。
  await Promise.all([
    rm(path.join(mapDir, "paint"), { recursive: true, force: true }),
    rm(path.join(mapDir, "vegetation"), { recursive: true, force: true }),
  ]);
}

async function writePreviewAuthoringAssets(mapDir, preset, heightConfig) {
  const [paint, vegetation] = await Promise.all([
    writePreviewPaintAssets(mapDir),
    writePreviewVegetationAssets(mapDir, preset, heightConfig),
  ]);

  return { paint, vegetation };
}

async function writePreviewPaintAssets(mapDir) {
  const paintDir = path.join(mapDir, "paint");
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
  return { layerCount: Object.keys(layers).length, splatByteLength: pixels.byteLength };
}

async function writePreviewVegetationAssets(mapDir, preset, heightConfig) {
  const vegetationDir = path.join(mapDir, "vegetation");
  await mkdir(path.join(vegetationDir, "regions"), { recursive: true });

  const models = createPreviewVegetationModels();
  const modelIds = ["fern", "quiverTree"];
  const instances = createPreviewVegetationInstances(preset, heightConfig);
  const groupedCells = new Map();

  for (const instance of instances) {
    const cellX = Math.floor(instance.x / vegetationCellSizeMeters);
    const cellZ = Math.floor(instance.z / vegetationCellSizeMeters);
    const key = vegetationCellKey(cellX, cellZ);
    const group = groupedCells.get(key) ?? { cellX, cellZ, instances: [] };
    group.instances.push(instance);
    groupedCells.set(key, group);
  }

  const sortedCells = Array.from(groupedCells.values()).sort((left, right) => left.cellZ - right.cellZ || left.cellX - right.cellX);
  const groupedRegions = new Map();
  for (const cell of sortedCells) {
    const region = vegetationRegionCoordsForCell(cell.cellX, cell.cellZ);
    const key = vegetationRegionKey(region.x, region.z);
    const group = groupedRegions.get(key) ?? { x: region.x, z: region.z, cells: [] };
    group.cells.push({
      key: vegetationCellKey(cell.cellX, cell.cellZ),
      localIndex: vegetationRegionLocalCellIndex(cell.cellX, cell.cellZ),
      bytes: encodeVegetationInstances(cell.instances, modelIds),
    });
    groupedRegions.set(key, group);
  }

  const regionMasks = {};
  const sortedRegions = Array.from(groupedRegions.values()).sort(compareRegionCoords);
  for (const region of sortedRegions) {
    region.cells.sort((left, right) => left.localIndex - right.localIndex);
    let mask = 0n;
    for (const cell of region.cells) {
      mask |= 1n << BigInt(cell.localIndex);
    }

    await writeFile(
      path.join(mapDir, vegetationRegionPath(region.x, region.z)),
      encodeVegetationRegionPack(region.cells),
    );
    regionMasks[vegetationRegionKey(region.x, region.z)] = formatVegetationRegionMask(mask);
  }

  const manifest = {
    version: 5,
    models,
    instances: {
      format: vegetationRegionFormat,
      instanceFormat: vegetationInstanceFormat,
      cellSizeMeters: vegetationCellSizeMeters,
      regionSizeCells: vegetationRegionSizeCells,
      regionsDirectory: vegetationRegionsDirectory,
      regions: regionMasks,
      modelIds,
    },
  };
  await writeFile(path.join(vegetationDir, "models.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

  return {
    modelCount: Object.keys(models).length,
    instanceCount: instances.length,
    cellCount: sortedCells.length,
    regionCount: sortedRegions.length,
  };
}

function createPreviewVegetationModels() {
  return {
    quiverTree: {
      id: "quiverTree",
      name: "Quiver Tree",
      path: "../../assets/model/quiver_tree_02_1k.gltf/quiver_tree_02_1k.gltf",
      lod1Path: "../../assets/model/quiver_tree_02_1k.gltf/lod1/quiver_tree_02_lod1.gltf",
      lod1DistanceMeters: 70,
      lod2Path: "../../assets/model/quiver_tree_02_1k.gltf/lod2/quiver_tree_02_lod2.gltf",
      lod2DistanceMeters: 135,
      targetHeightMeters: 7.5,
      baseScale: 1.2,
      castShadow: true,
      receiveShadow: true,
      maxVisibleDistanceMeters: 260,
      shadowDistanceMeters: 70,
    },
    fern: {
      id: "fern",
      name: "Fern",
      path: "../../assets/model/fern_02_1k.gltf/fern_02_1k.gltf",
      lod1Path: "../../assets/model/fern_02_1k.gltf/lod1/fern_02_lod1.gltf",
      lod1DistanceMeters: 35,
      lod2Path: "../../assets/model/fern_02_1k.gltf/lod2/fern_02_lod2.gltf",
      lod2DistanceMeters: 75,
      targetHeightMeters: 0.9,
      baseScale: 0.85,
      castShadow: true,
      receiveShadow: true,
      maxVisibleDistanceMeters: 120,
      shadowDistanceMeters: 35,
    },
  };
}

function createPreviewVegetationInstances(preset, heightConfig) {
  const treePoints = [
    [-220, -140], [-170, -70], [-120, 95], [-65, -180], [-30, 145], [38, -120],
    [85, 58], [140, -35], [190, 125], [235, -160], [-255, 90], [265, 40],
  ];
  const instances = [];

  for (let index = 0; index < treePoints.length; index += 1) {
    const [worldX, worldZ] = treePoints[index];
    instances.push({
      id: `tree-${index}`,
      modelId: "quiverTree",
      x: worldX,
      y: generateHeight(worldX, worldZ, preset, heightConfig),
      z: worldZ,
      rotationY: hash2i(index, 17, 9201, preset.seed) * Math.PI * 2,
      scale: 0.85 + hash2i(index, 29, 9202, preset.seed) * 0.55,
    });
  }

  let fernIndex = 0;
  for (const [baseX, baseZ] of treePoints.slice(0, 9)) {
    for (let ringIndex = 0; ringIndex < 5; ringIndex += 1) {
      const angle = hash2i(fernIndex, 41, 9301, preset.seed) * Math.PI * 2;
      const radius = 9 + hash2i(fernIndex, 53, 9302, preset.seed) * 24;
      const worldX = baseX + Math.cos(angle) * radius;
      const worldZ = baseZ + Math.sin(angle) * radius;
      instances.push({
        id: `fern-${fernIndex}`,
        modelId: "fern",
        x: worldX,
        y: generateHeight(worldX, worldZ, preset, heightConfig),
        z: worldZ,
        rotationY: angle + Math.PI * 0.5,
        scale: 0.55 + hash2i(fernIndex, 67, 9303, preset.seed) * 0.7,
      });
      fernIndex += 1;
    }
  }

  return instances;
}

function vegetationCellKey(cellX, cellZ) {
  return `${cellX},${cellZ}`;
}

function vegetationRegionKey(regionX, regionZ) {
  return `${regionX},${regionZ}`;
}

function vegetationRegionCoordsForCell(cellX, cellZ) {
  return {
    x: Math.floor(cellX / vegetationRegionSizeCells),
    z: Math.floor(cellZ / vegetationRegionSizeCells),
  };
}

function vegetationRegionLocalCellIndex(cellX, cellZ) {
  const region = vegetationRegionCoordsForCell(cellX, cellZ);
  const localX = cellX - region.x * vegetationRegionSizeCells;
  const localZ = cellZ - region.z * vegetationRegionSizeCells;
  return localZ * vegetationRegionSizeCells + localX;
}

function vegetationRegionPath(regionX, regionZ) {
  return `${vegetationRegionsDirectory}/r_${formatCellCoordinate(regionX)}_${formatCellCoordinate(regionZ)}.vegpack`;
}

function formatVegetationRegionMask(mask) {
  return `0x${mask.toString(16).padStart(16, "0")}`;
}

function formatCellCoordinate(value) {
  return value < 0 ? `m${Math.abs(value)}` : String(value);
}

function encodeVegetationInstances(instances, modelIds) {
  const bytes = Buffer.alloc(instances.length * vegetationInstanceRecordByteLength);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  for (let index = 0; index < instances.length; index += 1) {
    const instance = instances[index];
    const modelIndex = modelIds.indexOf(instance.modelId);
    if (modelIndex < 0) {
      throw new Error(`Vegetation instance '${instance.id}' references unknown model '${instance.modelId}'`);
    }

    const offset = index * vegetationInstanceRecordByteLength;
    view.setUint16(offset, modelIndex, true);
    view.setUint16(offset + 2, 0, true);
    view.setFloat32(offset + 4, instance.x, true);
    view.setFloat32(offset + 8, instance.y, true);
    view.setFloat32(offset + 12, instance.z, true);
    view.setFloat32(offset + 16, instance.rotationY, true);
    view.setFloat32(offset + 20, instance.scale, true);
  }

  return bytes;
}

function encodeVegetationRegionPack(cells) {
  const payloadByteLength = cells.reduce((total, cell) => total + cell.bytes.byteLength, 0);
  const indexByteLength = vegetationRegionPackHeaderByteLength + cells.length * vegetationRegionPackEntryByteLength;
  const bytes = Buffer.alloc(indexByteLength + payloadByteLength);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  view.setUint32(0, vegetationRegionPackMagic, true);
  view.setUint16(4, vegetationRegionPackVersion, true);
  view.setUint16(6, cells.length, true);

  let payloadOffset = indexByteLength;
  for (let index = 0; index < cells.length; index += 1) {
    const cell = cells[index];
    if (cell.bytes.byteLength % vegetationInstanceRecordByteLength !== 0) {
      throw new Error(`Vegetation cell '${cell.key}' has invalid byte length ${cell.bytes.byteLength}`);
    }

    const entryOffset = vegetationRegionPackHeaderByteLength + index * vegetationRegionPackEntryByteLength;
    view.setUint16(entryOffset, cell.localIndex, true);
    view.setUint16(entryOffset + 2, 0, true);
    view.setUint32(entryOffset + 4, cell.bytes.byteLength / vegetationInstanceRecordByteLength, true);
    bytes.set(cell.bytes, payloadOffset);
    payloadOffset += cell.bytes.byteLength;
  }

  return bytes;
}

function getPageBounds(preset) {
  return preset.pageBounds ?? defaultPageBounds;
}

async function generateMap(preset) {
  const now = Date.now();
  const mapDir = path.join(projectDir, "maps", preset.id);
  const mapPath = path.join(mapDir, "map.json");
  const heightRootDir = path.join(mapDir, "terrain", "height");
  const heightConfig = buildHeightConfig(preset);
  const bounds = getPageBounds(preset);
  const pageKeys = [];
  const regionGroups = new Map();
  let minHeight = Number.POSITIVE_INFINITY;
  let maxHeight = Number.NEGATIVE_INFINITY;

  await clearMapAuthoringAssets(mapDir);
  await Promise.all([
    rm(path.join(mapDir, "terrain", "chunks"), { recursive: true, force: true }),
    rm(heightRootDir, { recursive: true, force: true }),
  ]);

  for (let pz = bounds.minPageZ; pz <= bounds.maxPageZ; pz += 1) {
    for (let px = bounds.minPageX; px <= bounds.maxPageX; px += 1) {
      const heights = createHeightPage(px, pz, preset, heightConfig);
      for (const value of heights) {
        minHeight = Math.min(minHeight, value);
        maxHeight = Math.max(maxHeight, value);
      }

      const key = `${px},${pz}`;
      const region = heightRegionCoordsForPage(px, pz);
      const regionKey = heightRegionKey(region.x, region.z);
      const group = regionGroups.get(regionKey) ?? { x: region.x, z: region.z, pages: [] };
      group.pages.push({ key, px, pz, bytes: Buffer.from(heights.buffer, heights.byteOffset, heights.byteLength) });
      regionGroups.set(regionKey, group);
      pageKeys.push(key);
    }
  }

  const terrainHeightManifest = {
    version: terrainHeightManifestVersion,
    format: heightRegionFormat,
    sampleFormat: heightSampleFormat,
    pageResolution: heightPageResolution,
    pageSizeMeters,
    regionSizePages: heightRegionSizePages,
    regionsDirectory: heightRegionsDirectory,
    regions: {},
  };

  for (const region of Array.from(regionGroups.values()).sort(compareRegionCoords)) {
    const pages = region.pages.sort(comparePageKeys);
    const packBytes = Buffer.concat(pages.map((page) => page.bytes));
    let regionMask = 0n;
    for (const page of pages) {
      regionMask |= 1n << BigInt(heightRegionLocalPageIndex(page.px, page.pz));
    }

    const regionFilePath = path.join(mapDir, heightRegionPathFor(region.x, region.z));
    await mkdir(path.dirname(regionFilePath), { recursive: true });
    await writeFile(regionFilePath, packBytes);
    terrainHeightManifest.regions[heightRegionKey(region.x, region.z)] = formatHeightRegionMask(regionMask);
  }

  const pageCountX = bounds.maxPageX - bounds.minPageX + 1;
  const pageCountZ = bounds.maxPageZ - bounds.minPageZ + 1;
  const worldSizeMeters = Math.max(pageCountX, pageCountZ) * pageSizeMeters;

  const mapData = {
    version: mapVersion,
    seed: preset.seed,
    world: {
      sizeMeters: worldSizeMeters,
      pageSizeMeters,
      originX: 0,
      originZ: 0,
    },
    terrainPath: terrainHeightPath,
    paintPath: paintManifestPath,
    vegetationPath: vegetationModelsPath,
    metadata: {
      name: preset.name,
      created: now,
      modified: now,
    },
  };

  await mkdir(mapDir, { recursive: true });
  await mkdir(path.dirname(path.join(mapDir, terrainHeightPath)), { recursive: true });
  await writeFile(mapPath, `${JSON.stringify(mapData, null, 2)}\n`, "utf8");
  await writeFile(path.join(mapDir, terrainHeightPath), `${JSON.stringify(terrainHeightManifest, null, 2)}\n`, "utf8");
  const preview = await writePreviewAuthoringAssets(mapDir, preset, heightConfig);

  return {
    id: preset.id,
    name: preset.name,
    mapPath,
    minHeight,
    maxHeight,
    pageCount: pageKeys.length,
    regionCount: Object.keys(terrainHeightManifest.regions).length,
    paintLayerCount: preview.paint.layerCount,
    vegetationInstanceCount: preview.vegetation.instanceCount,
    vegetationCellCount: preview.vegetation.cellCount,
    vegetationRegionCount: preview.vegetation.regionCount,
    areaSquareKilometers: pageKeys.length * pageSizeMeters * pageSizeMeters / 1_000_000,
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
  const inlinePrefix = `${flag}=`;
  const inlineValue = cliArgs.find((arg) => arg.startsWith(inlinePrefix));
  if (inlineValue) {
    return inlineValue.slice(inlinePrefix.length);
  }

  const index = cliArgs.indexOf(flag);
  if (index >= 0 && index + 1 < cliArgs.length) {
    return cliArgs[index + 1];
  }

  return null;
}

function readProjectArg() {
  for (let index = 0; index < cliArgs.length; index += 1) {
    const arg = cliArgs[index];
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
    console.log(`  Height pages: ${result.pageCount}`);
    console.log(`  Height regions: ${result.regionCount}`);
    console.log(`  Paint layers: ${result.paintLayerCount}`);
    console.log(`  Vegetation instances: ${result.vegetationInstanceCount} in ${result.vegetationCellCount} cells / ${result.vegetationRegionCount} regions`);
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