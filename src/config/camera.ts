// Camera configuration.
// 相机配置

export type CameraMode = "firstPerson" | "thirdPerson";
export type ThirdPersonStyle = "overShoulder" | "chase";

export const cameraConfig = {
  // Perspective camera params.
  // 透视相机参数
  fovDegrees: 75,
  nearMeters: 0.05,
  farMeters: 2000,
} as const;

export type CameraConfig = typeof cameraConfig;
