// VegetationData: Data structures for vegetation painting system.
// VegetationData：植被绘制系统的数据结构

/**
 * Vegetation type categories.
 * 植被类型分类
 */
export type VegetationType = "grass" | "shrub" | "tree";

/**
 * Vegetation layer definition.
 * Each layer defines a vegetation type with placement and LOD settings.
 * 植被层定义
 * 每层定义一种植被类型及其放置和 LOD 设置
 *
 * Example vegetation.json:
 * {
 *   "fern": {
 *     "model": "assets/models/fern/fern.glb",
 *     "densityChannel": 0,
 *     "maxDensity": 50,
 *     "scale": { "min": 0.8, "max": 1.2 },
 *     "rotation": { "randomY": true },
 *     "slopeLimit": 45,
 *     "lodDistances": [30],
 *     "fadeOutDistance": 60,
 *     "type": "grass"
 *   }
 * }
 *
 * Density map channels are assigned by densityChannel:
 * - densityChannel: 0 → R channel
 * - densityChannel: 1 → G channel
 * - densityChannel: 2 → B channel
 * - densityChannel: 3 → A channel
 * Maximum 4 vegetation layers supported per density map.
 *
 * 密度贴图通道由 densityChannel 指定：
 * - densityChannel: 0 → R 通道
 * - densityChannel: 1 → G 通道
 * - densityChannel: 2 → B 通道
 * - densityChannel: 3 → A 通道
 * 每张密度贴图最多支持 4 个植被层
 */
export interface VegetationLayerDef {
  // Required: GLB/GLTF model path / 必需：GLB/GLTF 模型路径
  model: string;

  // Density map channel (0-3 = R, G, B, A) / 密度贴图通道
  densityChannel: 0 | 1 | 2 | 3;

  // Maximum instances per square meter / 每平方米最大实例数
  maxDensity: number;

  // Vegetation type category / 植被类型分类
  type: VegetationType;

  // Transform settings / 变换设置
  scale: { min: number; max: number };
  rotation: { randomY: boolean };

  // Placement rules / 放置规则
  slopeLimit: number; // Max slope in degrees / 最大坡度（度）
  heightRange?: { min: number; max: number }; // Optional height limits / 可选高度限制

  // GPU Driven LOD settings / GPU 驱动的 LOD 设置
  lodDistances: number[]; // Distance thresholds for LOD switching / LOD 切换距离阈值
  fadeOutDistance: number; // Distance at which vegetation disappears / 植被消失距离

  // Optional features / 可选功能
  collision?: boolean; // Generate collision body / 生成碰撞体
  wind?: { strength: number }; // Wind animation strength / 风动画强度
  castShadow?: boolean; // Cast shadow (default: true) / 投射阴影（默认：true）
  alignToSlope?: boolean; // Align to terrain normal / 对齐地形法线
  billboard?: { distance: number }; // Billboard at far distance / 远距离 billboard
}

/**
 * vegetation.json structure.
 * Keys = vegetation layer names, values = layer definitions.
 * If file doesn't exist → vegetation editing disabled.
 * vegetation.json 结构
 * 键 = 植被层名称，值 = 层定义
 * 如果文件不存在 → 禁用植被编辑
 */
export type VegetationDefinition = Record<string, VegetationLayerDef>;

/**
 * Vegetation density map data.
 * 植被密度贴图数据
 *
 * Each pixel's RGBA values are density weights (0-255):
 * - R = density for layer with densityChannel: 0
 * - G = density for layer with densityChannel: 1
 * - B = density for layer with densityChannel: 2
 * - A = density for layer with densityChannel: 3
 *
 * 每像素的 RGBA 值是密度权重（0-255）：
 * - R = densityChannel: 0 的层密度
 * - G = densityChannel: 1 的层密度
 * - B = densityChannel: 2 的层密度
 * - A = densityChannel: 3 的层密度
 */
export interface VegetationDensityMap {
  resolution: number;
  pixels: Uint8Array;
}

/**
 * Create default density map (empty, no vegetation).
 * 创建默认密度贴图（空，无植被）
 */
export function createDefaultDensityMap(resolution: number = 1024): VegetationDensityMap {
  const pixels = new Uint8Array(resolution * resolution * 4);
  // All zeros = no vegetation anywhere
  // 全零 = 无植被
  return { resolution, pixels };
}

/**
 * Get vegetation layer names in order.
 * 按顺序获取植被层名称
 */
export function getVegetationLayerNames(def: VegetationDefinition): string[] {
  return Object.keys(def);
}

/**
 * Get layers by density channel.
 * 按密度通道获取层
 */
export function getLayersByChannel(
  def: VegetationDefinition
): Map<0 | 1 | 2 | 3, string> {
  const map = new Map<0 | 1 | 2 | 3, string>();
  for (const [name, layer] of Object.entries(def)) {
    if (layer.densityChannel >= 0 && layer.densityChannel <= 3) {
      map.set(layer.densityChannel, name);
    }
  }
  return map;
}

/**
 * Get layer name for a density channel.
 * 获取密度通道对应的层名称
 */
export function getVegetationLayerForChannel(
  channel: 0 | 1 | 2 | 3,
  def: VegetationDefinition
): string | null {
  for (const [name, layer] of Object.entries(def)) {
    if (layer.densityChannel === channel) {
      return name;
    }
  }
  return null;
}

/**
 * Validate vegetation definition.
 * Returns array of validation errors (empty if valid).
 * 验证植被定义
 * 返回验证错误数组（如果有效则为空）
 */
export function validateVegetationDefinition(def: VegetationDefinition): string[] {
  const errors: string[] = [];
  const usedChannels = new Set<number>();

  for (const [name, layer] of Object.entries(def)) {
    // Check required fields.
    // 检查必需字段
    if (!layer.model) {
      errors.push(`Layer "${name}": missing model path`);
    }

    if (layer.densityChannel < 0 || layer.densityChannel > 3) {
      errors.push(`Layer "${name}": densityChannel must be 0-3`);
    } else if (usedChannels.has(layer.densityChannel)) {
      errors.push(`Layer "${name}": densityChannel ${layer.densityChannel} already used`);
    } else {
      usedChannels.add(layer.densityChannel);
    }

    if (layer.maxDensity <= 0) {
      errors.push(`Layer "${name}": maxDensity must be > 0`);
    }

    if (!layer.scale || layer.scale.min <= 0 || layer.scale.max <= 0) {
      errors.push(`Layer "${name}": invalid scale range`);
    }

    if (layer.slopeLimit < 0 || layer.slopeLimit > 90) {
      errors.push(`Layer "${name}": slopeLimit must be 0-90`);
    }

    if (!layer.lodDistances || layer.lodDistances.length === 0) {
      errors.push(`Layer "${name}": lodDistances must have at least one value`);
    }

    if (layer.fadeOutDistance <= 0) {
      errors.push(`Layer "${name}": fadeOutDistance must be > 0`);
    }

    if (!["grass", "shrub", "tree"].includes(layer.type)) {
      errors.push(`Layer "${name}": type must be "grass", "shrub", or "tree"`);
    }
  }

  return errors;
}
