import type { PerspectiveCamera, Scene, WebGPURenderer } from "three/webgpu";
import type { InputManager } from "../input/InputManager";

export type GameResources = {
  scene: Scene;
  camera: PerspectiveCamera;
  renderer: WebGPURenderer;
  input: InputManager;
};
