// Default values configuration.
// 默认值配置

import type { CameraMode, ThirdPersonStyle } from "./camera";

export const defaultsConfig = {
  cameraMode: "firstPerson" as CameraMode,
  thirdPersonStyle: "overShoulder" as ThirdPersonStyle,
} as const;

export type DefaultsConfig = typeof defaultsConfig;
