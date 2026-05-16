// Terrain configuration.
// 地形配置

export const terrainConfig = {
  // Streaming chunk system for large worlds.
  // 大世界的流式分块系统
  streaming: {
    // Per-chunk size in meters (power of 2 recommended).
    // 每个 chunk 的尺寸（米，建议 2 的幂）
    chunkSizeMeters: 64,

    // View distance in chunks (radius around player).
    // 视距（以 chunk 为单位的半径）。5 chunks = 320m 视距
    viewDistanceChunks: 5,

    // Maximum chunks to load/unload per frame (prevent stutter).
    // 每帧最多加载/卸载的 chunk 数量（防止卡顿）
    maxChunkOpsPerFrame: 1,

    // Hysteresis distance to prevent thrashing at boundaries (chunks).
    // 边界滞后距离，防止在边界处频繁加载/卸载（chunk 数）
    hysteresisChunks: 2,
  },

  // LOD (Level of Detail) system for terrain chunks.
  // 地形 chunk 的 LOD（细节层级）系统
  lod: {
    // LOD levels (index 0 = highest detail).
    // LOD 级别（索引 0 = 最高细节）
    levels: [
      { segmentsPerSide: 64, maxDistanceMeters: 64 },
      { segmentsPerSide: 32, maxDistanceMeters: 128 },
      { segmentsPerSide: 16, maxDistanceMeters: 256 },
      { segmentsPerSide: 8, maxDistanceMeters: 512 },
      { segmentsPerSide: 4, maxDistanceMeters: Infinity },
    ] as const,
  },

  // GPU compute pipeline configuration.
  // GPU 计算管线配置
  gpuCompute: {
    // Resolution per height page tile in the atlas; 129 keeps shared page edges explicit.
    // 图集中每个高度 page tile 的分辨率；129 用于显式保留共享边界采样。
    tileResolution: 129,

    // Number of tiles per side in the atlas texture.
    // 图集纹理每边的 tile 数
    atlasTilesPerSide: 32,

    // Maximum chunks for culling buffer.
    // 剔除缓冲区的最大 chunk 数
    maxCullChunks: 1024,
  },

  // Floating origin for large world precision.
  // 大世界精度的浮动原点
  floatingOrigin: {
    // Rebase threshold in meters (rebase when player exceeds this distance from origin).
    // 重置阈值（米），当玩家距原点超过此距离时重置
    // NOTE: Temporarily set very high to disable until chunk system properly supports it.
    // 注意：临时设置很高以禁用，直到 chunk 系统正确支持它
    rebaseThresholdMeters: 100000,
  },

  // World bounds (invisible walls at map edges).
  // 世界边界（地图边缘的空气墙）
  worldBounds: {
    // Half-size of the playable area (meters). Total size = 2 * halfSize.
    // 可玩区域的半尺寸（米）。总尺寸 = 2 * halfSize
    // Terrain chunks stream dynamically, so this can be any size.
    // 地形 chunk 动态流式加载，所以这可以是任意大小
    // 1600m = 1.6km radius = 3.2km x 3.2km playable area, matching the 50x50 chunk main map.
    // 1600米 = 1.6公里半径 = 3.2公里 x 3.2公里可玩区域，与 50x50 chunk 的 main 地图匹配。
    halfSizeMeters: 1600,
  },

  // CPU heightmap cache for fast heightAt queries.
  // CPU 高度图缓存，用于快速 heightAt 查询
  heightCache: {
    // Resolution of the cached heightmap (samples per chunk side).
    // 缓存高度图的分辨率（每 chunk 边的采样数）
    samplesPerChunkSide: 17,
  },

  // Ground plane constraints (prevents falling through world).
  // 地面约束（防止穿透世界）
  groundPlane: {
    // Minimum Y offset above terrain surface (meters).
    // 地形表面上方的最小 Y 偏移（米）
    minYMeters: 0.1,
  },

  height: {
    // Baseline height (meters, world Y).
    // 基准高度（米，世界坐标 Y）
    baseHeightMeters: 0,

    // Normal sampling step for the CPU mesh (meters).
    // CPU 生成网格法线的采样步长（米）
    normalSampleStepMeters: 0.6,

    // Terrain seed (deterministic).
    // 地形随机种子（确定性）
    seed: 1337,

    // ============== Multi-layer terrain generation ==============
    // ============== 多层地形生成 ==============
    // Realistic terrain uses multiple noise layers at different scales:
    // 真实地形使用不同尺度的多层噪声叠加：
    // - Continental: very large scale mountain ranges / 大陆尺度的山脉
    // - Mountains: mid-scale peaks and ridges / 中尺度的山峰和山脊
    // - Hills: rolling hills and valleys / 丘陵起伏
    // - Details: small surface variation / 小尺度表面细节

    // Continental layer (very large features ~1000-3000m).
    // 大陆层（非常大的地貌特征 ~1000-3000m）
    // Creates base elevation variance - most areas are low, few are high.
    // 创建基础高度变化 - 大部分区域较低，少部分较高
    continental: {
      enabled: true,
      amplitudeMeters: 120,         // Max height contribution / 最大高度贡献
      frequencyPerMeter: 0.0003,    // ~3300m features / ~3300m 尺度特征
      octaves: 2,
      lacunarity: 2.0,
      gain: 0.5,
      // DISABLED ridged noise - causes all-high terrain.
      // 禁用山脊噪声 - 会导致全部高地形
      ridged: false,
      ridgeSharpness: 2.0,
      // Power curve: <1 = more low areas, >1 = more high areas.
      // 幂曲线：<1 = 更多低地，>1 = 更多高地
      // 2.5 means ~70% of terrain is below 30% of max height.
      // 2.5 意味着约70%的地形低于最大高度的30%
      powerCurve: 2.5,
    },

    // Mountain layer (sparse high peaks).
    // 山地层（稀疏的高峰）
    // Only adds significant height in select areas.
    // 只在选定区域添加显著高度
    mountain: {
      enabled: true,
      amplitudeMeters: 200,         // Tall peaks where they occur / 出现处的高峰
      frequencyPerMeter: 0.0008,    // ~1250m features / ~1250m 尺度特征
      octaves: 3,
      lacunarity: 2.0,
      gain: 0.5,
      ridged: false,
      ridgeSharpness: 2.0,
      // Strong power curve: most areas get near-zero contribution.
      // 强幂曲线：大部分区域贡献接近零
      powerCurve: 3.0,
    },

    // Hills layer (gentle rolling terrain).
    // 丘陵层（平缓起伏的地形）
    hills: {
      enabled: true,
      amplitudeMeters: 25,          // Gentle hills / 平缓丘陵
      frequencyPerMeter: 0.003,     // ~333m features / ~333m 尺度特征
      octaves: 4,
      lacunarity: 2.0,
      gain: 0.5,
      ridged: false,
      // Mild power curve for natural variation.
      // 温和的幂曲线产生自然变化
      powerCurve: 1.5,
    },

    // Detail layer (small surface variation).
    // 细节层（小表面变化）
    detail: {
      enabled: true,
      amplitudeMeters: 8,           // Small bumps / 小凸起
      frequencyPerMeter: 0.015,     // ~67m features / ~67m 尺度特征
      octaves: 3,
      lacunarity: 2.0,
      gain: 0.5,
      ridged: false,
      powerCurve: 1.0,              // No power curve for detail / 细节不用幂曲线
    },

    // ============== Terrain shaping ==============
    // ============== 地形塑形 ==============

    // Plains flattening: flatten low areas to create plains.
    // 平原压平：将低洼区域压平形成平原
    plains: {
      enabled: false,  // Disabled to allow full height range / 禁用以保留完整高度范围
      // Heights below this become flatter (meters).
      // 低于此高度的区域会变平坦（米）
      thresholdMeters: 50,
      // Flattening strength (0=none, 1=completely flat).
      // 压平强度（0=无，1=完全平坦）
      strength: 0.4,
      // Transition smoothness (meters).
      // 过渡平滑度（米）
      transitionMeters: 30,
    },

    // Valley carving: create river-like depressions.
    // 山谷雕刻：创建类似河谷的凹陷
    valleys: {
      enabled: true,
      amplitudeMeters: 15,          // Subtle valleys / 微妙的山谷
      frequencyPerMeter: 0.0006,    // Large scale valleys / 大尺度山谷
      octaves: 2,
      // Only carve into lower terrain (blends out at high elevations).
      // 只在低地雕刻（在高海拔逐渐消失）
      heightFadeStartMeters: 40,
      heightFadeEndMeters: 80,
    },

    // Domain warp makes terrain less grid-like.
    // 域扭曲能减少网格感
    warp: {
      enabled: true,
      amplitudeMeters: 80,
      frequencyPerMeter: 0.0015,
    },

    // Erosion simulation (simplified thermal erosion).
    // 侵蚀模拟（简化的热力侵蚀）
    erosion: {
      enabled: true,
      // Smooths steep slopes / 平滑陡坡
      thermalStrength: 0.15,
      // Adds fine noise to simulate erosion patterns / 添加细噪声模拟侵蚀纹理
      detailFrequency: 0.08,
      detailAmplitude: 1.5,
    },
  },

} as const;

type WidenLiteral<T> = T extends number
  ? number
  : T extends string
    ? string
    : T extends boolean
      ? boolean
      : T extends readonly (infer Item)[]
        ? readonly WidenLiteral<Item>[]
        : T extends object
          ? { readonly [Key in keyof T]: WidenLiteral<T[Key]> }
          : T;

export type TerrainConfig = WidenLiteral<typeof terrainConfig>;
