import type { Group } from "three/webgpu";
import type { CameraMode, ThirdPersonStyle } from "../../config/world";

export type TransformComponent = {
  x: number;
  y: number;
  z: number;
  yawRadians: number;
  pitchRadians: number;
};

export type PlayerComponent = {
  cameraMode: CameraMode;
  thirdPersonStyle: ThirdPersonStyle;
};

export type AvatarComponent = {
  object: Group;
};
