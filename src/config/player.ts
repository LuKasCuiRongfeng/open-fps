// Player configuration.
// 玩家配置

export const playerConfig = {
  // Eye height in meters.
  // 视线高度（米）
  eyeHeightMeters: 1.62,

  // Movement speeds (m/s).
  // 移动速度（米/秒）
  moveSpeed: 1.6,
  sprintSpeed: 5.5,

  // Jump/physics.
  // 跳跃/物理参数
  physics: {
    gravityMetersPerSecond2: 9.8,
    maxFallSpeedMetersPerSecond: 55.0,

    // Air control: how much the player can influence horizontal velocity while airborne.
    // 空中控制：玩家在空中时能影响水平速度的程度
    airControl: {
      // Acceleration while airborne (m/s²). Lower than ground for realistic feel.
      // 空中加速度（米/秒²）。比地面低，更真实
      accelerationMetersPerSecond2: 8.0,

      // Maximum horizontal speed achievable through air control alone.
      // 仅通过空中控制能达到的最大水平速度
      maxSpeedMetersPerSecond: 6.0,

      // Drag coefficient for air resistance (1/s). Slows down horizontal velocity gradually.
      // 空气阻力系数（1/秒）。逐渐减慢水平速度
      dragPerSecond: 2.0,
    },

    // Ground friction: how quickly horizontal velocity decays when grounded with no input.
    // 地面摩擦：着地且无输入时水平速度衰减的速度
    groundFriction: {
      // Deceleration when no input (m/s²). Higher = stops faster.
      // 无输入时的减速度（米/秒²）。越高 = 停得越快
      decelerationMetersPerSecond2: 50.0,
    },
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

  // Third-person camera settings.
  // 第三人称相机设置
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
    // Spawn position on the ground plane (center of initially loaded area).
    // 出生点（地面平面上，初始加载区域的中心）
    // With viewDistanceChunks=5 and chunkSize=64m, loaded area is ~640m x 640m.
    // 视距5个chunk，每个64m，加载区域约 640m x 640m
    xMeters: 160,
    zMeters: 160,
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
} as const;

export type PlayerConfig = typeof playerConfig;
