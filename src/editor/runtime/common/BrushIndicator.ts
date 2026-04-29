// BrushIndicator: common brush indicator data and interface.
// BrushIndicator：通用笔刷指示器数据和接口

/**
 * Brush indicator state for rendering.
 * 用于渲染的笔刷指示器状态
 */
export interface BrushIndicatorState {
  /** Is the brush indicator visible? / 笔刷指示器是否可见 */
  visible: boolean;
  /** World X position. / 世界 X 坐标 */
  worldX: number;
  /** World Z position. / 世界 Z 坐标 */
  worldZ: number;
  /** Brush radius in meters. / 笔刷半径（米） */
  radius: number;
  /** Falloff (0-1, affects inner ring display). / 衰减（0-1，影响内圈显示） */
  falloff: number;
  /** Is brush currently active (painting)? / 笔刷是否正在激活（绘制中） */
  active: boolean;
}

/**
 * Brush indicator visual style.
 * 笔刷指示器视觉样式
 */
export interface BrushIndicatorStyle {
  /** Outer ring color (RGB 0-1). / 外圈颜色（RGB 0-1） */
  outerColor: { r: number; g: number; b: number };
  /** Inner ring color (RGB 0-1). / 内圈颜色（RGB 0-1） */
  innerColor: { r: number; g: number; b: number };
  /** Active state color (RGB 0-1). / 激活状态颜色（RGB 0-1） */
  activeColor: { r: number; g: number; b: number };
  /** Opacity (0-1). / 不透明度（0-1） */
  opacity: number;
}

/**
 * Default brush indicator styles for different editor types.
 * 不同编辑器类型的默认笔刷指示器样式
 */
export const BRUSH_INDICATOR_STYLES = {
  /** Terrain editing (orange/yellow). / 地形编辑（橙色/黄色） */
  terrain: {
    outerColor: { r: 1.0, g: 0.6, b: 0.0 },
    innerColor: { r: 1.0, g: 0.8, b: 0.2 },
    activeColor: { r: 1.0, g: 1.0, b: 0.4 },
    opacity: 0.9,
  },
  /** Texture painting (cyan/blue). / 纹理绘制（青色/蓝色） */
  texture: {
    outerColor: { r: 0.0, g: 0.8, b: 1.0 },
    innerColor: { r: 0.3, g: 0.9, b: 1.0 },
    activeColor: { r: 0.5, g: 1.0, b: 1.0 },
    opacity: 0.9,
  },
} as const satisfies Record<string, BrushIndicatorStyle>;

export type BrushIndicatorType = keyof typeof BRUSH_INDICATOR_STYLES;

/**
 * Create a default brush indicator state (hidden).
 * 创建默认的笔刷指示器状态（隐藏）
 */
export function createBrushIndicatorState(): BrushIndicatorState {
  return {
    visible: false,
    worldX: 0,
    worldZ: 0,
    radius: 10,
    falloff: 0.5,
    active: false,
  };
}
