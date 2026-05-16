// TileAtlasAllocator: manages dynamic tile allocation in the terrain height atlas.
// TileAtlasAllocator：管理地形高度图集中的动态 tile 分配

/**
 * Manages dynamic tile allocation in the terrain height atlas.
 * 管理地形高度图集中的动态 tile 分配
 *
 * Uses a simple free-list allocator for O(1) alloc/free.
 * 使用简单的空闲列表分配器，O(1) 分配/释放
 */
export class TileAtlasAllocator {
  readonly tilesPerSide: number;
  readonly tileResolution: number;
  readonly atlasResolution: number;

  private readonly pageToTile = new Map<string, number>();
  private readonly freeTiles: number[] = [];

  constructor(tileResolution: number, tilesPerSide: number) {
    this.tileResolution = tileResolution;
    this.tilesPerSide = tilesPerSide;
    this.atlasResolution = tileResolution * tilesPerSide;

    const totalTiles = tilesPerSide * tilesPerSide;
    for (let i = totalTiles - 1; i >= 0; i--) {
      this.freeTiles.push(i);
    }
  }

  private makeKey(cx: number, cz: number): string {
    return `${cx},${cz}`;
  }

  hasTile(cx: number, cz: number): boolean {
    return this.pageToTile.has(this.makeKey(cx, cz));
  }

  getTileIndex(cx: number, cz: number): number | undefined {
    return this.pageToTile.get(this.makeKey(cx, cz));
  }

  allocate(cx: number, cz: number): number {
    const key = this.makeKey(cx, cz);

    const existing = this.pageToTile.get(key);
    if (existing !== undefined) {
      return existing;
    }

    if (this.freeTiles.length === 0) {
      console.error(`[TileAtlasAllocator] No free tiles available!`);
      return -1;
    }

    const tileIndex = this.freeTiles.pop()!;
    this.pageToTile.set(key, tileIndex);
    return tileIndex;
  }

  free(cx: number, cz: number): void {
    const key = this.makeKey(cx, cz);
    const tileIndex = this.pageToTile.get(key);
    if (tileIndex !== undefined) {
      this.pageToTile.delete(key);
      this.freeTiles.push(tileIndex);
    }
  }

  tileIndexToCoords(tileIndex: number): { tileX: number; tileZ: number } {
    const tileX = tileIndex % this.tilesPerSide;
    const tileZ = Math.floor(tileIndex / this.tilesPerSide);
    return { tileX, tileZ };
  }

  getPageTileUV(cx: number, cz: number): { uOffset: number; vOffset: number; uvScale: number } {
    const key = this.makeKey(cx, cz);
    const tileIndex = this.pageToTile.get(key);

    if (tileIndex === undefined) {
      console.error(`[TileAtlasAllocator] No tile allocated for page (${cx}, ${cz})`);
      return { uOffset: 0, vOffset: 0, uvScale: 1 / this.tilesPerSide };
    }

    const { tileX, tileZ } = this.tileIndexToCoords(tileIndex);

    return {
      uOffset: tileX / this.tilesPerSide,
      vOffset: tileZ / this.tilesPerSide,
      uvScale: 1 / this.tilesPerSide,
    };
  }

  getAtlasInfo(): { resolution: number; tileResolution: number; tilesPerSide: number } {
    return {
      resolution: this.atlasResolution,
      tileResolution: this.tileResolution,
      tilesPerSide: this.tilesPerSide,
    };
  }

  get allocatedCount(): number {
    return this.pageToTile.size;
  }

  get freeCount(): number {
    return this.freeTiles.length;
  }
}