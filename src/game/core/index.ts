// Core module barrel exports.
// Core 模块桶导出

export { FpsCounter, GameRenderer } from "./rendering";
export { SettingsManager } from "./SettingsManager";
export { SystemScheduler, type SystemEntry, type SystemFn, type SystemPhase } from "./scheduler";
export { TileAtlasAllocator, GpuTextureIO, WebGpuBackend, type WebGpuBackendHandle } from "./gpu";
