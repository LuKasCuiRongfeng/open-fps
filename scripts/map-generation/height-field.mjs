import {
  clamp,
  hash2i,
  heightPageResolution,
  lerp,
  pageSizeMeters,
} from "./shared.mjs";

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

export function buildHeightConfig(preset) {
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

export function generateHeight(worldX, worldZ, preset, heightConfig) {
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

export function createHeightPage(px, pz, preset, heightConfig) {
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

function smoothstep(edge0, edge1, value) {
  const t = clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

function quintic(value) {
  return value * value * value * (value * (value * 6 - 15) + 10);
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
