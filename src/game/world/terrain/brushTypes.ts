// Terrain brush data contracts owned by the terrain runtime.
// 地形运行时拥有的地形画刷数据契约

/**
 * Brush types supported by terrain height editing.
 * 地形高度编辑支持的画刷类型
 */
export type BrushType = "raise" | "lower" | "smooth" | "flatten";

/**
 * Brush settings consumed by terrain GPU brush processing.
 * 地形 GPU 画刷处理消费的画刷设置
 */
export interface BrushSettings {
  type: BrushType;
  radiusMeters: number;
  strength: number;
  falloff: number;
}

/**
 * Brush stroke event consumed by the terrain runtime.
 * 地形运行时消费的画刷笔触事件
 */
export interface BrushStroke {
  worldX: number;
  worldZ: number;
  brush: BrushSettings;
  dt: number;
}