// World/gameplay tuning lives here.
// 世界/玩法的可调参数都放这里（不要在代码里硬编码常量）

export type CameraMode = "firstPerson" | "thirdPerson";
export type ThirdPersonStyle = "overShoulder" | "chase";

export const worldConfig = {
  // Small prototype map now; may expand to ~10km later.
  // 当前先做小地图，后续可能扩展到 10km。
  map: {
    widthMeters: 50,
    depthMeters: 50,
    groundY: 0,
  },

  player: {
    // Eye height in meters.
    // 视线高度（米）
    eyeHeightMeters: 1.7,

    // Movement speeds (m/s)
    // 移动速度（米/秒）
    moveSpeed: 6.0,
    sprintSpeed: 9.0,

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
      followLerpPerSecond: 18.0,
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
        heightMeters: 1.1,
        radiusMeters: 0.22,
      },
      head: {
        radiusMeters: 0.16,
      },
      legs: {
        heightMeters: 0.8,
        radiusMeters: 0.10,
        spreadMeters: 0.16,
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
    ground: {
      // Ground albedo color.
      // 地面颜色
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
