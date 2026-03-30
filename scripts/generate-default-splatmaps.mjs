import path from "node:path";
import { promises as fs } from "node:fs";
import zlib from "node:zlib";

const outputResolution = 1024;
const sampleEpsilon = 1e-6;

const mapProfiles = {
  main: {
    lowStart: 0.16,
    lowEnd: 0.36,
    edgeBias: 0.09,
    flatnessBias: 0.18,
    noiseBias: 0.08,
    ridgeBias: 0.10,
  },
  ridge: {
    lowStart: 0.08,
    lowEnd: 0.22,
    edgeBias: 0.03,
    flatnessBias: 0.11,
    noiseBias: 0.05,
    ridgeBias: 0.20,
  },
  coast: {
    lowStart: 0.18,
    lowEnd: 0.42,
    edgeBias: 0.20,
    flatnessBias: 0.18,
    noiseBias: 0.08,
    ridgeBias: 0.08,
  },
  islands: {
    lowStart: 0.20,
    lowEnd: 0.48,
    edgeBias: 0.24,
    flatnessBias: 0.14,
    noiseBias: 0.10,
    ridgeBias: 0.06,
  },
  default: {
    lowStart: 0.16,
    lowEnd: 0.36,
    edgeBias: 0.10,
    flatnessBias: 0.16,
    noiseBias: 0.08,
    ridgeBias: 0.10,
  },
};

const crcTable = buildCrcTable();

function buildCrcTable() {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value & 1) !== 0 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[index] = value >>> 0;
  }
  return table;
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (let index = 0; index < buffer.length; index += 1) {
    crc = crcTable[(crc ^ buffer[index]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const typeBuffer = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);

  const crcBuffer = Buffer.alloc(4);
  crcBuffer.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);

  return Buffer.concat([length, typeBuffer, data, crcBuffer]);
}

function encodePngRgba(width, height, rgbaPixels) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const stride = width * 4;
  const raw = Buffer.alloc(height * (stride + 1));
  for (let y = 0; y < height; y += 1) {
    const sourceOffset = y * stride;
    const targetOffset = y * (stride + 1);
    raw[targetOffset] = 0;
    rgbaPixels.copy(raw, targetOffset + 1, sourceOffset, sourceOffset + stride);
  }

  const compressed = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([
    signature,
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", compressed),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function smoothstep(edge0, edge1, value) {
  if (edge0 === edge1) {
    return value < edge0 ? 0 : 1;
  }
  const t = clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

function hash2d(x, y, seed) {
  const value = Math.sin(x * 127.1 + y * 311.7 + seed * 17.13) * 43758.5453123;
  return value - Math.floor(value);
}

function valueNoise(x, y, seed) {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = x0 + 1;
  const y1 = y0 + 1;
  const sx = smoothstep(0, 1, x - x0);
  const sy = smoothstep(0, 1, y - y0);

  const n00 = hash2d(x0, y0, seed);
  const n10 = hash2d(x1, y0, seed);
  const n01 = hash2d(x0, y1, seed);
  const n11 = hash2d(x1, y1, seed);

  const nx0 = lerp(n00, n10, sx);
  const nx1 = lerp(n01, n11, sx);
  return lerp(nx0, nx1, sy);
}

function decodeHeights(base64) {
  const buffer = Buffer.from(base64, "base64");
  return new Float32Array(buffer.buffer, buffer.byteOffset, buffer.byteLength / 4);
}

function parseChunkKey(key) {
  const [chunkX, chunkZ] = key.split(",").map(Number);
  return { chunkX, chunkZ };
}

function sampleChunkHeight(heights, tileResolution, localU, localV) {
  const gridMax = tileResolution - 1;
  const gridX = clamp(localU, 0, 1) * gridMax;
  const gridZ = clamp(localV, 0, 1) * gridMax;

  const x0 = Math.floor(gridX);
  const z0 = Math.floor(gridZ);
  const x1 = Math.min(x0 + 1, gridMax);
  const z1 = Math.min(z0 + 1, gridMax);
  const tx = gridX - x0;
  const tz = gridZ - z0;

  const h00 = heights[z0 * tileResolution + x0];
  const h10 = heights[z0 * tileResolution + x1];
  const h01 = heights[z1 * tileResolution + x0];
  const h11 = heights[z1 * tileResolution + x1];

  return lerp(lerp(h00, h10, tx), lerp(h01, h11, tx), tz);
}

function sampleHeight(context, u, v) {
  const clampedU = clamp(u, 0, 1 - sampleEpsilon);
  const clampedV = clamp(v, 0, 1 - sampleEpsilon);
  const worldX = context.minWorldX + clampedU * context.worldWidthMeters;
  const worldZ = context.minWorldZ + clampedV * context.worldDepthMeters;

  const chunkFloatX = (worldX - context.minWorldX) / context.chunkSizeMeters;
  const chunkFloatZ = (worldZ - context.minWorldZ) / context.chunkSizeMeters;
  const chunkX = context.minChunkX + Math.min(Math.floor(chunkFloatX), context.chunkCountX - 1);
  const chunkZ = context.minChunkZ + Math.min(Math.floor(chunkFloatZ), context.chunkCountZ - 1);
  const localU = chunkFloatX - Math.floor(chunkFloatX);
  const localV = chunkFloatZ - Math.floor(chunkFloatZ);
  const chunk = context.chunks.get(`${chunkX},${chunkZ}`);

  if (!chunk) {
    throw new Error(`Missing chunk ${chunkX},${chunkZ}`);
  }

  return sampleChunkHeight(chunk, context.tileResolution, localU, localV);
}

function sampleSlope(context, u, v) {
  const du = 1 / outputResolution;
  const dv = 1 / outputResolution;
  const hL = sampleHeight(context, u - du, v);
  const hR = sampleHeight(context, u + du, v);
  const hD = sampleHeight(context, u, v - dv);
  const hU = sampleHeight(context, u, v + dv);
  const dx = (context.worldWidthMeters * du) * 2;
  const dz = (context.worldDepthMeters * dv) * 2;
  const sx = (hR - hL) / Math.max(dx, sampleEpsilon);
  const sz = (hU - hD) / Math.max(dz, sampleEpsilon);
  return Math.sqrt(sx * sx + sz * sz);
}

function createContext(mapId, mapData) {
  const entries = Object.entries(mapData.chunks ?? {});
  if (entries.length === 0) {
    throw new Error(`Map ${mapId} has no chunks`);
  }

  const parsedChunks = new Map();
  let minChunkX = Number.POSITIVE_INFINITY;
  let maxChunkX = Number.NEGATIVE_INFINITY;
  let minChunkZ = Number.POSITIVE_INFINITY;
  let maxChunkZ = Number.NEGATIVE_INFINITY;
  let minHeight = Number.POSITIVE_INFINITY;
  let maxHeight = Number.NEGATIVE_INFINITY;

  for (const [key, chunkData] of entries) {
    const { chunkX, chunkZ } = parseChunkKey(key);
    const heights = decodeHeights(chunkData.heightsBase64);
    parsedChunks.set(key, heights);

    minChunkX = Math.min(minChunkX, chunkX);
    maxChunkX = Math.max(maxChunkX, chunkX);
    minChunkZ = Math.min(minChunkZ, chunkZ);
    maxChunkZ = Math.max(maxChunkZ, chunkZ);

    for (let index = 0; index < heights.length; index += 1) {
      const value = heights[index];
      minHeight = Math.min(minHeight, value);
      maxHeight = Math.max(maxHeight, value);
    }
  }

  const chunkCountX = maxChunkX - minChunkX + 1;
  const chunkCountZ = maxChunkZ - minChunkZ + 1;
  const chunkSizeMeters = mapData.chunkSizeMeters;

  return {
    mapId,
    seed: mapData.seed ?? 0,
    tileResolution: mapData.tileResolution,
    chunkSizeMeters,
    chunks: parsedChunks,
    minChunkX,
    maxChunkX,
    minChunkZ,
    maxChunkZ,
    chunkCountX,
    chunkCountZ,
    minWorldX: minChunkX * chunkSizeMeters,
    minWorldZ: minChunkZ * chunkSizeMeters,
    worldWidthMeters: chunkCountX * chunkSizeMeters,
    worldDepthMeters: chunkCountZ * chunkSizeMeters,
    minHeight,
    maxHeight,
    heightRange: Math.max(maxHeight - minHeight, 1),
    profile: mapProfiles[mapId] ?? mapProfiles.default,
  };
}

function computeBeachWeight(context, u, v) {
  const height = sampleHeight(context, u, v);
  const heightNorm = (height - context.minHeight) / context.heightRange;
  const slope = sampleSlope(context, u, v);
  const slopeNorm = clamp(slope * 18, 0, 1);
  const flatness = 1 - smoothstep(0.08, 0.45, slopeNorm);
  const lowland = 1 - smoothstep(context.profile.lowStart, context.profile.lowEnd, heightNorm);
  const minEdgeDistance = Math.min(u, 1 - u, v, 1 - v);
  const edgeMask = 1 - smoothstep(0.05, 0.22, minEdgeDistance);

  const macroNoise = valueNoise(u * 6.5, v * 6.5, context.seed + 11);
  const detailNoise = valueNoise(u * 25, v * 25, context.seed + 29);
  const noiseOffset = ((macroNoise * 0.65 + detailNoise * 0.35) - 0.5) * 2;
  const ridgePenalty = smoothstep(0.42, 0.8, heightNorm) * smoothstep(0.24, 0.65, slopeNorm) * context.profile.ridgeBias;

  let beachWeight =
    lowland * 0.7 +
    flatness * context.profile.flatnessBias +
    edgeMask * context.profile.edgeBias +
    noiseOffset * context.profile.noiseBias -
    ridgePenalty;

  if (context.mapId === "coast") {
    beachWeight += edgeMask * 0.08;
  }

  if (context.mapId === "islands") {
    const radial = 1 - smoothstep(0.18, 0.7, Math.hypot(u - 0.5, v - 0.5));
    beachWeight += radial * 0.05;
  }

  if (context.mapId === "ridge") {
    beachWeight -= smoothstep(0.2, 0.55, heightNorm) * 0.12;
  }

  return clamp(beachWeight, 0.02, 0.98);
}

function buildSplatMap(context) {
  const pixels = Buffer.alloc(outputResolution * outputResolution * 4);

  for (let y = 0; y < outputResolution; y += 1) {
    const v = (y + 0.5) / outputResolution;
    for (let x = 0; x < outputResolution; x += 1) {
      const u = (x + 0.5) / outputResolution;
      const beachWeight = computeBeachWeight(context, u, v);
      const beach = Math.round(beachWeight * 255);
      const mud = 255 - beach;
      const index = (y * outputResolution + x) * 4;

      pixels[index] = beach;
      pixels[index + 1] = mud;
      pixels[index + 2] = 0;
      pixels[index + 3] = 0;
    }
  }

  return pixels;
}

async function listMapDirectories(mapsDir) {
  const entries = await fs.readdir(mapsDir, { withFileTypes: true });
  return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
}

async function generateForMap(projectDir, mapId) {
  const mapDirectory = path.join(projectDir, "maps", mapId);
  const mapPath = path.join(mapDirectory, "map.json");
  const texturePath = path.join(mapDirectory, "texture.json");

  await fs.access(texturePath);
  const mapData = JSON.parse(await fs.readFile(mapPath, "utf8"));
  const context = createContext(mapId, mapData);
  const splatPixels = buildSplatMap(context);
  const png = encodePngRgba(outputResolution, outputResolution, splatPixels);
  const outputPath = path.join(mapDirectory, "splatmap.png");

  await fs.writeFile(outputPath, png);
  return {
    mapId,
    outputPath,
    minHeight: context.minHeight,
    maxHeight: context.maxHeight,
  };
}

async function main() {
  const projectArg = process.argv[2] ?? "test_pro";
  const projectDir = path.resolve(projectArg);
  const mapsDir = path.join(projectDir, "maps");
  const mapIds = await listMapDirectories(mapsDir);

  if (mapIds.length === 0) {
    throw new Error(`No maps found in ${mapsDir}`);
  }

  const generated = [];
  for (const mapId of mapIds) {
    generated.push(await generateForMap(projectDir, mapId));
  }

  for (const result of generated) {
    console.log(`generated ${path.relative(projectDir, result.outputPath)} (${result.minHeight.toFixed(1)}-${result.maxHeight.toFixed(1)}m)`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});