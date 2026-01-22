// Player configuration.
// 玩家配置

// ============================================================================
// Runtime config - can be modified at runtime via UI.
// 运行时配置 - 可通过 UI 在运行时修改
// ============================================================================
export const playerRuntimeConfig = {
  // Movement.
  // 移动
  moveSpeed: 1.6, // m/s / 米/秒
  sprintBonus: 3.9, // m/s (final sprint = moveSpeed + sprintBonus) / 米/秒

  // Jump/physics.
  // 跳跃/物理
  jumpVelocity: 4.6, // m/s / 米/秒
  gravity: 9.8, // m/s² / 米/秒²
  maxFallSpeed: 55.0, // m/s / 米/秒

  // Mouse look.
  // 鼠标视角
  mouseSensitivity: 1.0,

  // Third-person camera.
  // 第三人称相机
  chaseFollowDistance: 3.0, // meters / 米
  chaseHeightOffset: 1.2, // meters / 米
  overShoulderFollowDistance: 2.6, // meters / 米
  overShoulderHeightOffset: 1.35, // meters / 米
  overShoulderOffset: 0.55, // meters (positive = right shoulder) / 米（正数 = 右肩）
  followLerpPerSecond: 12.0,
};

// ============================================================================
// Static config - fixed at compile time, not exposed to UI.
// 静态配置 - 编译时固定，不暴露给 UI
// ============================================================================
export const playerStaticConfig = {
  // Body dimensions.
  // 身体尺寸
  eyeHeightMeters: 1.62,

  // Look limits.
  // 视角限制
  pitchMinRadians: -1.25,
  pitchMaxRadians: 1.10,
  radiansPerPixel: 0.002,
  lookSmoothingFactor: 0.0001,

  // Air control.
  // 空中控制
  airControlAcceleration: 8.0, // m/s² / 米/秒²
  airControlMaxSpeed: 6.0, // m/s / 米/秒
  airControlDrag: 2.0, // 1/s / 1/秒
  groundFrictionDeceleration: 50.0, // m/s² / 米/秒²

  // Spawn position.
  // 出生点
  spawnX: 0,
  spawnZ: 0,

  // Avatar dimensions.
  // 人物模型尺寸
  avatarBodyHeight: 0.60,
  avatarBodyRadius: 0.18,
  avatarHeadRadius: 0.12,
  avatarLegsHeight: 0.90,
  avatarLegsRadius: 0.08,
  avatarLegsSpread: 0.18,

  // Avatar colors (RGB 0-1).
  // 人物模型颜色
  avatarBodyColor: [0.35, 0.36, 0.38] as const,
  avatarHeadColor: [0.85, 0.72, 0.62] as const,
  avatarLegsColor: [0.20, 0.20, 0.22] as const,
  avatarRoughness: 0.9,
  avatarMetalness: 0.0,

  // Avatar geometry detail.
  // 人物模型几何细节
  avatarBodySegments: 20,
  avatarHeadWidthSegments: 24,
  avatarHeadHeightSegments: 16,
  avatarLegsSegments: 16,
} as const;
