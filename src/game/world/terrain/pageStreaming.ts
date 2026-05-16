import type { BrushStroke } from "./brushTypes";
import type { PageCoord } from "./TerrainPageManager";

type PageLike = {
  cx: number;
  cz: number;
};

export type PageBounds = {
  minCx: number;
  maxCx: number;
  minCz: number;
  maxCz: number;
};

export function buildPageLoadQueue(
  playerCx: number,
  playerCz: number,
  viewDistance: number,
  hasPage: (key: string) => boolean,
  isPending: (key: string) => boolean,
  makePageKey: (cx: number, cz: number) => string,
): PageCoord[] {
  const loadQueue: PageCoord[] = [];

  for (let dz = -viewDistance; dz <= viewDistance; dz += 1) {
    for (let dx = -viewDistance; dx <= viewDistance; dx += 1) {
      const cx = playerCx + dx;
      const cz = playerCz + dz;
      const key = makePageKey(cx, cz);

      if (!hasPage(key) && !isPending(key)) {
        loadQueue.push({ cx, cz });
      }
    }
  }

  loadQueue.sort((a, b) => {
    const distanceA = (a.cx - playerCx) ** 2 + (a.cz - playerCz) ** 2;
    const distanceB = (b.cx - playerCx) ** 2 + (b.cz - playerCz) ** 2;
    return distanceA - distanceB;
  });

  return loadQueue;
}

export function buildPageUnloadQueue(
  playerCx: number,
  playerCz: number,
  maxDistance: number,
  pages: Iterable<[string, PageLike]>,
): string[] {
  const unloadQueue: string[] = [];

  for (const [key, page] of pages) {
    const dx = Math.abs(page.cx - playerCx);
    const dz = Math.abs(page.cz - playerCz);

    if (dx > maxDistance || dz > maxDistance) {
      unloadQueue.push(key);
    }
  }

  return unloadQueue;
}

export function getAffectedPageBounds(
  strokes: readonly BrushStroke[],
  pageSize: number,
): PageBounds | null {
  if (strokes.length === 0) {
    return null;
  }

  let minCx = Infinity;
  let maxCx = -Infinity;
  let minCz = Infinity;
  let maxCz = -Infinity;

  for (const stroke of strokes) {
    const radius = stroke.brush.radiusMeters;
    minCx = Math.min(minCx, Math.floor((stroke.worldX - radius) / pageSize));
    maxCx = Math.max(maxCx, Math.floor((stroke.worldX + radius) / pageSize));
    minCz = Math.min(minCz, Math.floor((stroke.worldZ - radius) / pageSize));
    maxCz = Math.max(maxCz, Math.floor((stroke.worldZ + radius) / pageSize));
  }

  return { minCx, maxCx, minCz, maxCz };
}