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
  // Atlas dimensions (number of tiles per side).
  // 图集尺寸（每边的 tile 数）
  readonly tilesPerSide: number;

  // Resolution per chunk tile.
  // 每个 chunk tile 的分辨率
  readonly tileResolution: number;

  // Total atlas resolution.
  // 图集总分辨率
  readonly atlasResolution: number;

  // Maps "cx,cz" -> tile index (0 to tilesPerSide² - 1).
  // 映射 "cx,cz" -> tile 索引（0 到 tilesPerSide² - 1）
  private readonly chunkToTile = new Map<string, number>();

  // Free tile indices (stack for O(1) alloc/free).
  // 空闲 tile 索引（栈结构，O(1) 分配/释放）
  private readonly freeTiles: number[] = [];

  constructor(tileResolution: number, tilesPerSide: number) {
    this.tileResolution = tileResolution;
    this.tilesPerSide = tilesPerSide;
    this.atlasResolution = tileResolution * tilesPerSide;

    // Initialize free tile list with all tiles.
    // 初始化空闲 tile 列表，包含所有 tile
    const totalTiles = tilesPerSide * tilesPerSide;
    for (let i = totalTiles - 1; i >= 0; i--) {
      this.freeTiles.push(i);
    }
  }

  /**
   * Make chunk key from coordinates.
   * 从坐标生成 chunk 键
   */
  private makeKey(cx: number, cz: number): string {
    return `${cx},${cz}`;
  }

  /**
   * Check if a chunk has an allocated tile.
   * 检查 chunk 是否已分配 tile
   */
  hasTile(cx: number, cz: number): boolean {
    return this.chunkToTile.has(this.makeKey(cx, cz));
  }

  /**
   * Get tile index for a chunk (undefined if not allocated).
   * 获取 chunk 的 tile 索引（如果未分配则返回 undefined）
   */
  getTileIndex(cx: number, cz: number): number | undefined {
    return this.chunkToTile.get(this.makeKey(cx, cz));
  }

  /**
   * Allocate a tile for a chunk. Returns tile index or -1 if no free tiles.
   * 为 chunk 分配一个 tile。返回 tile 索引，如果没有空闲 tile 则返回 -1
   */
  allocate(cx: number, cz: number): number {
    const key = this.makeKey(cx, cz);

    // Check if already allocated.
    // 检查是否已分配
    const existing = this.chunkToTile.get(key);
    if (existing !== undefined) {
      return existing;
    }

    // Allocate new tile from free list.
    // 从空闲列表分配新 tile
    if (this.freeTiles.length === 0) {
      console.error(`[TileAtlasAllocator] No free tiles available!`);
      return -1;
    }

    const tileIndex = this.freeTiles.pop()!;
    this.chunkToTile.set(key, tileIndex);
    return tileIndex;
  }

  /**
   * Free a tile when chunk is unloaded.
   * chunk 卸载时释放 tile
   */
  free(cx: number, cz: number): void {
    const key = this.makeKey(cx, cz);
    const tileIndex = this.chunkToTile.get(key);
    if (tileIndex !== undefined) {
      this.chunkToTile.delete(key);
      this.freeTiles.push(tileIndex);
    }
  }

  /**
   * Convert tile index to (tileX, tileZ) coordinates.
   * 将 tile 索引转换为 (tileX, tileZ) 坐标
   */
  tileIndexToCoords(tileIndex: number): { tileX: number; tileZ: number } {
    const tileX = tileIndex % this.tilesPerSide;
    const tileZ = Math.floor(tileIndex / this.tilesPerSide);
    return { tileX, tileZ };
  }

  /**
   * Get tile UV offset for a chunk.
   * 获取 chunk 的 tile UV 偏移
   */
  getChunkTileUV(cx: number, cz: number): { uOffset: number; vOffset: number; uvScale: number } {
    const key = this.makeKey(cx, cz);
    const tileIndex = this.chunkToTile.get(key);

    if (tileIndex === undefined) {
      console.error(`[TileAtlasAllocator] No tile allocated for chunk (${cx}, ${cz})`);
      return { uOffset: 0, vOffset: 0, uvScale: 1 / this.tilesPerSide };
    }

    const { tileX, tileZ } = this.tileIndexToCoords(tileIndex);

    return {
      uOffset: tileX / this.tilesPerSide,
      vOffset: tileZ / this.tilesPerSide,
      uvScale: 1 / this.tilesPerSide,
    };
  }

  /**
   * Get atlas info for material setup.
   * 获取图集信息，用于材质设置
   */
  getAtlasInfo(): { resolution: number; tileResolution: number; tilesPerSide: number } {
    return {
      resolution: this.atlasResolution,
      tileResolution: this.tileResolution,
      tilesPerSide: this.tilesPerSide,
    };
  }

  /**
   * Get number of allocated tiles.
   * 获取已分配的 tile 数量
   */
  get allocatedCount(): number {
    return this.chunkToTile.size;
  }

  /**
   * Get number of free tiles.
   * 获取空闲 tile 数量
   */
  get freeCount(): number {
    return this.freeTiles.length;
  }
}
