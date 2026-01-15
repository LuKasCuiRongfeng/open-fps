import type { PerspectiveCamera, Scene, WebGPURenderer } from "three/webgpu";
import type { InputManager } from "../input/InputManager";
import type { GameSettings } from "../settings/GameSettings";
import type { TerrainResource } from "../world/terrain";

export type GameResources = {
  scene: Scene;
  camera: PerspectiveCamera;
  renderer: WebGPURenderer;
  input: InputManager;
  settings: GameSettings;
  terrain: TerrainResource;
};
