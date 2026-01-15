// World/gameplay tuning lives here.
// 世界/玩法的可调参数都放这里（不要在代码里硬编码常量）

export type CameraMode = "firstPerson" | "thirdPerson";
export type ThirdPersonStyle = "overShoulder" | "chase";

export const worldConfig = {
  // Small prototype map now; may expand to ~10km later.
  // 当前先做小地图，后续可能扩展到 10km。
  map: {
    widthMeters: 500,
    depthMeters: 500,
    groundY: 0,

    // Air-wall inset from the map edge (meters).
    // 空气墙：距离地图边界的内缩距离（米）
    airWallInsetMeters: 0.35,
  },

  terrain: {
    gpuBake: {
      // Bake terrain height/normal on GPU via compute into storage textures.
      // 使用 GPU compute 烘焙地形高度/法线到 storage texture
      enabled: true,

      // Debug patterns to validate the bake/sampling pipeline.
      // 调试模式：用于验证 bake/采样链路是否正常
      debugPattern: "procedural" as "procedural" | "gradient" | "flat",

      // Used when debugPattern === "gradient" (meters).
      // 当 debugPattern === "gradient" 时使用（米）
      debugAmplitudeMeters: 20,

      // Workgroup size for the compute kernel.
      // compute kernel 的 workgroup 尺寸
      workgroupSize: 8,

      // Bake a normal texture too (recommended: avoids expensive per-fragment reconstruction).
      // 同时烘焙法线贴图（推荐：避免在像素阶段做昂贵的法线重建）
      bakeNormals: true,
    },

    // Single-tile terrain for now; later this becomes chunked/streamed.
    // 当前先做单块地形；后续会做分块/流式加载
    tile: {
      // Terrain is made of tiles laid out on XZ.
      // 地形由多个 tile 在 XZ 平面拼接而成
      tilesX: 4,
      tilesZ: 4,

      // Per-tile size in meters.
      // 单块 tile 的尺寸（米）
      widthMeters: 125,
      depthMeters: 125,

      // Controls mesh resolution. 256 => ~66k vertices.
      // 控制网格分辨率。256 => ~6.6 万顶点
      // Note: total vertex count roughly scales with (tilesX*tilesZ*segments^2).
      // 注意：总顶点数大致随 (tilesX*tilesZ*segments^2) 增长
      segmentsPerSide: 64,
    },

    height: {
      // Baseline height (meters, world Y).
      // 基准高度（米，世界坐标 Y）
      baseHeightMeters: 0,

      // Peak-to-valley scale in meters (roughly).
      // 地形起伏尺度（大致，米）
      amplitudeMeters: 18,

      // Base frequency (1/m). 0.01 => ~100m main features.
      // 基础频率（1/米）。0.01 => ~100 米尺度的主地形
      frequencyPerMeter: 0.01,

      // fBm parameters.
      // fBm 参数
      octaves: 5,
      lacunarity: 2.0,
      gain: 0.5,

      // Terrain seed (deterministic).
      // 地形随机种子（确定性）
      seed: 1337,

      // Normal sampling step for the CPU mesh (meters).
      // CPU 生成网格法线的采样步长（米）
      normalSampleStepMeters: 0.6,

      warp: {
        // Domain warp makes terrain less grid-like.
        // 域扭曲能减少网格感
        enabled: true,
        amplitudeMeters: 18,
        frequencyPerMeter: 0.004,
      },
    },

    material: {
      // Height-based biome thresholds.
      // 基于高度的地表分区阈值
      dirtToGrassStartMeters: -2,
      dirtToGrassEndMeters: 2,
      rockHeightStartMeters: 8,
      rockHeightEndMeters: 14,

      // Slope thresholds (0=flat, 1=vertical).
      // 坡度阈值（0=平坦，1=垂直）
      rockSlopeStart: 0.28,
      rockSlopeEnd: 0.55,

      // Albedo colors (linear RGB 0..1).
      // 反照率颜色（线性 RGB 0..1）
      grassColorRgb: [0.13, 0.46, 0.12] as const,
      dirtColorRgb: [0.21, 0.18, 0.12] as const,
      rockColorRgb: [0.35, 0.35, 0.36] as const,

      // Macro variation (GPU noise) for biome patchiness.
      // 宏观变化（GPU 噪声），让地表更自然/成片
      macro: {
        frequencyPerMeter: 0.006,
        octaves: 3,
        lacunarity: 2.0,
        diminish: 0.5,
        amplitude: 1.0,

        // How much the macro noise shifts the dirt/grass transition heights.
        // 宏观噪声对“泥土/草地”高度过渡的偏移强度
        heightShiftMeters: 3.0,
      },

      // Rock breakup (GPU Worley noise) to avoid smooth rock bands.
      // 岩石破碎度（GPU Worley 噪声），避免岩石带过于平滑
      rockBreakup: {
        frequencyPerMeter: 0.08,
        jitter: 0.9,
        threshold: 0.55,
        softness: 0.12,
        strength: 0.45,
      },

      // Wet/muddy lowlands (no water simulation yet).
      // 低洼湿地/泥地（暂不做真实积水模拟）
      wetness: {
        enabled: true,

        // Height range where wetness fades out.
        // 湿度消退的高度范围
        startHeightMeters: -1.5,
        endHeightMeters: 1.5,

        // Favor flatter surfaces (slope: 0 flat -> 1 vertical).
        // 更偏向平坦区域（坡度：0 平坦 -> 1 垂直）
        slopeStart: 0.05,
        slopeEnd: 0.35,

        // Optional macro modulation strength (0..1).
        // 可选的宏观调制强度（0..1）
        macroInfluence: 0.35,

        // How strongly to blend towards mud.
        // 向泥地颜色混合的强度
        strength: 0.55,

        // Mud appearance.
        // 泥地外观
        mudColorRgb: [0.16, 0.13, 0.09] as const,
        darken: 0.92,

        // Wet areas are smoother (lower roughness).
        // 潮湿区域更“光滑”（更低 roughness）
        roughness: 0.70,
      },

      // Procedural detail normal (breaks up shading at close range).
      // 程序化细节法线（近距离打散光照）
      detailNormal: {
        enabled: true,
        frequencyPerMeter: 0.9,
        octaves: 2,
        lacunarity: 2.0,
        diminish: 0.6,
        amplitude: 1.0,
        strength: 0.65,
      },

      // Micro-variation frequency (1/m).
      // 微观变化频率（1/米）
      detailFrequencyPerMeter: 0.35,

      // Micro-variation brightness range.
      // 微观变化的明暗范围
      detailShadeMin: 0.92,
      detailShadeMax: 1.08,

      metalness: 0.0,
      roughness: 1.0,
    },
  },

  player: {
    // Eye height in meters.
    // 视线高度（米）
    eyeHeightMeters: 1.62,

    // Movement speeds (m/s)
    // 移动速度（米/秒）
    moveSpeed: 1.6,
    sprintSpeed: 5.5,

    // Jump/physics.
    // 跳跃/物理参数
    physics: {
      gravityMetersPerSecond2: 9.8,
      maxFallSpeedMetersPerSecond: 55.0,
      groundSnapMeters: 0.001,
    },
    jump: {
      // Initial upward velocity.
      // 起跳初速度
      velocityMetersPerSecond: 4.6,
    },

    // Mouse look sensitivity.
    // 鼠标灵敏度
    mouseSensitivity: 1.0,

    look: {
      // Mouse pixels -> radians scaling.
      // 鼠标像素 -> 弧度 的缩放
      radiansPerPixel: 0.002,
    },

    // Vertical look limits.
    // 俯仰角限制
    pitch: {
      minRadians: -1.25,
      maxRadians: 1.10,
    },

    // Planned: third-person follow distance/offset.
    // 预留：第三人称跟随距离/偏移
    thirdPerson: {
      chase: {
        followDistanceMeters: 3.0,
        heightOffsetMeters: 1.2,
      },
      overShoulder: {
        followDistanceMeters: 2.6,
        heightOffsetMeters: 1.35,
        // Positive means right-shoulder.
        // 正数表示右肩
        shoulderOffsetMeters: 0.55,
      },

      // Camera follow smoothing (0 = snap).
      // 相机跟随平滑（0=立即跟随）
      followLerpPerSecond: 12.0,
    },

    spawn: {
      // Spawn position on the ground plane.
      // 出生点（地面平面上）
      xMeters: 0,
      zMeters: 5,
    },

    avatar: {
      // Simple placeholder humanoid dimensions.
      // 简易人体占位模型尺寸
      body: {
        heightMeters: 0.60,
        radiusMeters: 0.18,
      },
      head: {
        radiusMeters: 0.12,
      },
      legs: {
        heightMeters: 0.90,
        radiusMeters: 0.08,
        spreadMeters: 0.18,
      },
      colors: {
        bodyRgb: [0.35, 0.36, 0.38] as const,
        headRgb: [0.85, 0.72, 0.62] as const,
        legsRgb: [0.20, 0.20, 0.22] as const,
      },
      roughness: 0.9,
      metalness: 0.0,

      geometry: {
        bodyRadialSegments: 20,
        headWidthSegments: 24,
        headHeightSegments: 16,
        legsRadialSegments: 16,
      },
    },
  },

  camera: {
    // Perspective camera params.
    // 透视相机参数
    fovDegrees: 75,
    nearMeters: 0.05,
    farMeters: 2000,
  },

  input: {
    // Keybinds.
    // 按键绑定
    toggleCameraMode: { code: "KeyV" },
    toggleThirdPersonStyle: { code: "KeyC" },

    // Jump.
    // 跳跃
    jump: { code: "Space" },
  },

  render: {
    // Cap DPR for perf.
    // 为性能限制 DPR
    maxPixelRatio: 2.0,

    // Clamp delta time to avoid huge simulation steps after tab-switching.
    // 限制 delta time，避免切换窗口后出现过大的模拟步长
    maxDeltaSeconds: 0.05,
  },

  visuals: {
    sky: {
      // Simple sky background (fallback); later can be replaced with procedural sky.
      // 简单天空背景色（兜底）；后续可替换为程序化天空
      colorHex: 0x7fb7ff,
    },

    fog: {
      // Atmospheric fog for large maps.
      // 大地图的大气雾（模拟薄雾/轻霾）
      // density units: 1/m (FogExp2)
      // density 单位：1/米（FogExp2）
      colorHex: 0xb7d9ff,
      densityPerMeter: 0.0025,
    },

    ground: {
      // Legacy flat-ground fallback parameters.
      // 旧的平地参数（作为兜底保留）
      colorRgb: [0.10, 0.45, 0.12] as const,
      metalness: 0.0,
      roughness: 1.0,
    },
    grid: {
      divisions: 50,
      majorColorHex: 0x223322,
      minorColorHex: 0x112211,
      yOffsetMeters: 0.001,
    },
    lights: {
      hemi: {
        skyColorHex: 0xbdd7ff,
        groundColorHex: 0x223322,
        intensity: 0.8,
      },
      sun: {
        colorHex: 0xffffff,
        intensity: 1.0,
        position: [20, 30, 10] as const,
      },
    },
    debug: {
      originMarkerSizeMeters: 0.3,
    },
  },

  defaults: {
    cameraMode: "firstPerson" as CameraMode,
    thirdPersonStyle: "overShoulder" as ThirdPersonStyle,
  },
} as const;
