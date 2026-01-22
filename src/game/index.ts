// Game module barrel exports.
// Game 模块桶导出

// Core utilities.
// 核心工具
export * from "./core";

// ECS.
// ECS
export { EcsWorld, type EntityId } from "./ecs/EcsWorld";
export { GameEcs, type GameWorld } from "./ecs/GameEcs";
export * from "./ecs/components";
export * from "./ecs/resources";

// Systems.
// 系统
export * from "./systems";

// Editor.
// 编辑器
export { TerrainEditor } from "./editor/terrain/TerrainEditor";
export { TerrainBrush } from "./editor/terrain/TerrainBrush";
export { EditorOrbitCamera } from "./editor/terrain/EditorOrbitCamera";
export { TextureEditor } from "./editor/texture/TextureEditor";
export { TextureBrush } from "./editor/texture/TextureBrush";

// Input.
// 输入
export { InputManager } from "./input/InputManager";
export { createRawInputState, clearFrameInputState, type RawInputState } from "./input/RawInputState";

// Prefabs.
// 预制体
export { createPlayer } from "./prefabs/createPlayer";
export { createHumanoidAvatar } from "./prefabs/createHumanoidAvatar";

// Project.
// 项目
export * from "./project/MapData";
export * from "./project/MapStorage";
export * from "./project/ProjectData";
export * from "./project/ProjectStorage";

// Settings.
// 设置
export * from "./settings/GameSettings";

// World.
// 世界
export * from "./world/terrain/terrain";
export * from "./world/sky";
export { FloatingOrigin } from "./world/FloatingOrigin";

// Main app.
// 主应用
export { GameApp, type GameBootPhase } from "./GameApp";
export { createWorld } from "./createWorld";
