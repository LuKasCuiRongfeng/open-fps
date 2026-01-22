// Camera configuration.
// 相机配置

export type CameraMode = "firstPerson" | "thirdPerson";
export type ThirdPersonStyle = "overShoulder" | "chase";

// ============================================================================
// Runtime config - can be modified at runtime via UI.
// 运行时配置 - 可通过 UI 在运行时修改
// ============================================================================
export const cameraRuntimeConfig = {
  fovDegrees: 75,
  mode: "firstPerson" as CameraMode,
  thirdPersonStyle: "overShoulder" as ThirdPersonStyle,
};

// ============================================================================
// Static config - fixed at compile time, not exposed to UI.
// 静态配置 - 编译时固定，不暴露给 UI
// ============================================================================
export const cameraStaticConfig = {
  nearMeters: 0.05,
  farMeters: 2000,
} as const;
