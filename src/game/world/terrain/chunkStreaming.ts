import type { BrushStroke } from "../../editor/terrain/TerrainEditor";
import type { ChunkCoord } from "./ChunkManager";

type ChunkLike = {
  cx: number;
  cz: number;
};

export type ChunkBounds = {
  minCx: number;
  maxCx: number;
  minCz: number;
  maxCz: number;
};

export function buildLoadQueue(
  playerCx: number,
  playerCz: number,
  viewDistance: number,
  hasChunk: (key: string) => boolean,
  isPending: (key: string) => boolean,
  chunkKey: (cx: number, cz: number) => string,
): ChunkCoord[] {
  const loadQueue: ChunkCoord[] = [];

  for (let dz = -viewDistance; dz <= viewDistance; dz++) {
    for (let dx = -viewDistance; dx <= viewDistance; dx++) {
      const cx = playerCx + dx;
      const cz = playerCz + dz;
      const key = chunkKey(cx, cz);

      if (!hasChunk(key) && !isPending(key)) {
        loadQueue.push({ cx, cz });
      }
    }
  }

  loadQueue.sort((a, b) => {
    const da = (a.cx - playerCx) ** 2 + (a.cz - playerCz) ** 2;
    const db = (b.cx - playerCx) ** 2 + (b.cz - playerCz) ** 2;
    return da - db;
  });

  return loadQueue;
}

export function buildUnloadQueue(
  playerCx: number,
  playerCz: number,
  maxDistance: number,
  chunks: Iterable<[string, ChunkLike]>,
): string[] {
  const unloadQueue: string[] = [];

  for (const [key, chunk] of chunks) {
    const chunkDx = Math.abs(chunk.cx - playerCx);
    const chunkDz = Math.abs(chunk.cz - playerCz);

    if (chunkDx > maxDistance || chunkDz > maxDistance) {
      unloadQueue.push(key);
    }
  }

  return unloadQueue;
}

export function getAffectedChunkBounds(
  strokes: readonly BrushStroke[],
  chunkSize: number,
): ChunkBounds | null {
  if (strokes.length === 0) {
    return null;
  }

  let minCx = Infinity;
  let maxCx = -Infinity;
  let minCz = Infinity;
  let maxCz = -Infinity;

  for (const stroke of strokes) {
    const radius = stroke.brush.radiusMeters;
    minCx = Math.min(minCx, Math.floor((stroke.worldX - radius) / chunkSize));
    maxCx = Math.max(maxCx, Math.floor((stroke.worldX + radius) / chunkSize));
    minCz = Math.min(minCz, Math.floor((stroke.worldZ - radius) / chunkSize));
    maxCz = Math.max(maxCz, Math.floor((stroke.worldZ + radius) / chunkSize));
  }

  return { minCx, maxCx, minCz, maxCz };
}