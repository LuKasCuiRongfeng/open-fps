// TextureData: Data structures for terrain texture painting system.
// TextureData：地形纹理绘制系统的数据结构

import {
  normalizePaintData,
  type MapPaintData,
} from "@project/MapData";

export const PAINT_MANIFEST_VERSION = 1;

/**
 * Maximum texture layers per splat map (RGBA = 4 channels).
 * 每张 splat map 的最大纹理层数（RGBA = 4 通道）
 */
export const LAYERS_PER_SPLAT_MAP = 4;

/**
 * Maximum number of splat maps supported.
 * 支持的最大 splat map 数量
 *
 * 4 splat maps × 4 channels = 16 texture layers max.
 * Can be increased if needed, but each additional splat map adds GPU overhead.
 * 4 张 splat map × 4 通道 = 最多 16 个纹理层
 * 如需要可以增加，但每增加一张 splat map 都会增加 GPU 开销
 */
export const MAX_SPLAT_MAPS = 4;

/**
 * PBR texture layer definition.
 * Each layer can have multiple maps for physically-based rendering.
 * PBR 纹理层定义
 * 每层可包含多张贴图用于物理渲染
 *
 * Example paint/layers.json paint manifest with multi-splat support:
 * {
 *   "version": 1,
 *   "layers": {
 *     "rocky": {
 *       "diffuse": "assets/textures/rocky_diffuse.jpg",
 *       "normal": "assets/textures/rocky_normal.jpg"
 *     },
 *     "grass": {
 *       "diffuse": "assets/textures/grass_diffuse.jpg",
 *       "splatMapIndex": 0
 *     },
 *     "sand": {
 *       "diffuse": "assets/textures/sand_diffuse.jpg",
 *       "splatMapIndex": 1
 *     }
 *   },
 *   "splatMaps": {
 *     "format": "rgba8-splat-v1",
 *     "resolution": 1024,
 *     "directory": "paint/pages",
 *     "indices": [0, 1]
 *   }
 * }
 *
 * Splat map assignment:
 * - If splatMapIndex is omitted, layers are AUTO-ASSIGNED in order:
 *   layers 0-3 → splatMap 0, layers 4-7 → splatMap 1, etc.
 * - If splatMapIndex is specified, use that splat map explicitly.
 * - Channel within splat map is determined by (layerIndex % 4):
 *   0=R, 1=G, 2=B, 3=A
 *
 * Splat map 分配：
 * - 如果省略 splatMapIndex，层按顺序自动分配：
 *   层 0-3 → splatMap 0，层 4-7 → splatMap 1，以此类推
 * - 如果指定 splatMapIndex，则使用该 splat map
 * - splat map 内的通道由 (layerIndex % 4) 决定：0=R, 1=G, 2=B, 3=A
 */
export interface TextureLayerDef {
  // Required: diffuse/albedo color map / 必需：漫反射/颜色贴图
  diffuse: string;

  // Optional PBR maps / 可选 PBR 贴图
  normal?: string;       // Normal map / 法线贴图
  displacement?: string; // Displacement/height map / 位移/高度贴图

  // Packed ARM texture (preferred) / 打包的 ARM 纹理（推荐）
  // R = AO, G = Roughness, B = Metallic
  arm?: string;

  // Separate maps (fallback if no ARM) / 分开的贴图（无 ARM 时使用）
  ao?: string;           // Ambient occlusion / 环境光遮蔽
  roughness?: string;    // Roughness map / 粗糙度贴图
  metallic?: string;     // Metallic map / 金属度贴图

  // Texture tiling scale in meters (default: 4) / 纹理平铺缩放（米，默认4）
  scale?: number;

  // Splat map index (0-3, default: auto-assigned by layer order).
  // Splat map 索引（0-3，默认：按层顺序自动分配）
  // Use this to group textures into specific splat maps for better organization.
  // 使用此字段可将纹理分组到特定的 splat map 以便更好地组织
  splatMapIndex?: number;
}

/**
 * paint/layers.json layers structure.
 * Keys = texture layer names, values = PBR map definitions.
 * If file doesn't exist -> render unpainted green terrain, editing disabled.
 * paint/layers.json 的 layers 结构
 * 键 = 纹理层名称，值 = PBR 贴图定义
 * 如果文件不存在 → 渲染未刷绿色地形，禁用编辑
 */
export type TextureDefinition = Record<string, TextureLayerDef>;

/** Versioned paint sidecar manifest. / 版本化 paint sidecar 清单。 */
export interface PaintManifest {
  version: typeof PAINT_MANIFEST_VERSION;
  layers: TextureDefinition;
  splatMaps: MapPaintData["splatMaps"];
}

export function createPaintManifest(layers: TextureDefinition, paintData: MapPaintData): PaintManifest {
  return {
    version: PAINT_MANIFEST_VERSION,
    layers: normalizeTextureDefinition(layers),
    splatMaps: normalizePaintData(paintData).splatMaps,
  };
}

export function serializePaintManifest(manifest: PaintManifest): string {
  return `${JSON.stringify(createPaintManifest(manifest.layers, { splatMaps: manifest.splatMaps }), null, 2)}\n`;
}

export function deserializePaintManifest(json: string): PaintManifest {
  const parsed = JSON.parse(json) as unknown;
  if (!isRecord(parsed)) {
    throw new Error("Paint manifest must be a JSON object");
  }

  if (parsed.version !== PAINT_MANIFEST_VERSION) {
    throw new Error(`Paint manifest version ${String(parsed.version ?? "unknown")} is not supported`);
  }

  if (!isRecord(parsed.layers)) {
    throw new Error("Paint manifest must contain texture layers");
  }

  if (!isRecord(parsed.splatMaps)) {
    throw new Error("Paint manifest must contain splat map metadata");
  }

  return createPaintManifest(normalizeTextureDefinition(parsed.layers), normalizePaintData({ splatMaps: parsed.splatMaps }));
}

export function createPaintDataFromManifest(manifest: PaintManifest): MapPaintData {
  return normalizePaintData({ splatMaps: manifest.splatMaps });
}

/**
 * Splat map data for terrain texture blending.
 * 地形纹理混合的 splat map 数据
 *
 * Each pixel's RGBA values are blend weights (0-255):
 * - R = weight for channel 0 within this splat map
 * - G = weight for channel 1 within this splat map
 * - B = weight for channel 2 within this splat map
 * - A = weight for channel 3 within this splat map
 *
 * 每像素的 RGBA 值是混合权重（0-255）：
 * - R = 此 splat map 内通道 0 的权重
 * - G = 此 splat map 内通道 1 的权重
 * - B = 此 splat map 内通道 2 的权重
 * - A = 此 splat map 内通道 3 的权重
 */
export interface SplatMapData {
  resolution: number;
  pixels: Uint8Array;
  /** Which splat map this data belongs to (0-based) / 此数据属于哪个 splat map（从 0 开始） */
  splatMapIndex?: number;
}

/**
 * Layer assignment info - which splat map and channel a layer uses.
 * 层分配信息 - 一个层使用哪个 splat map 和通道
 */
export interface LayerAssignment {
  /** Layer name from paint/layers.json / 来自 paint/layers.json 的层名称 */
  layerName: string;
  /** Global layer index in texture array / 纹理数组中的全局层索引 */
  layerIndex: number;
  /** Which splat map (0-3) / 哪个 splat map (0-3) */
  splatMapIndex: number;
  /** Which channel within splat map (0=R, 1=G, 2=B, 3=A) / splat map 内的通道 (0=R, 1=G, 2=B, 3=A) */
  channel: 0 | 1 | 2 | 3;
}

/**
 * Compute layer assignments for a texture definition.
 * 计算纹理定义的层分配
 *
 * If splatMapIndex is specified in layer def, use it.
 * Otherwise, auto-assign: layers 0-3 → splatMap 0, layers 4-7 → splatMap 1, etc.
 * 如果层定义中指定了 splatMapIndex，则使用它
 * 否则自动分配：层 0-3 → splatMap 0，层 4-7 → splatMap 1，等等
 */
export function computeLayerAssignments(def: TextureDefinition): LayerAssignment[] {
  const layerNames = Object.keys(def);
  const assignments: LayerAssignment[] = [];

  for (let i = 0; i < layerNames.length; i++) {
    const layerName = layerNames[i];
    const layerDef = def[layerName];

    // Use explicit splatMapIndex if provided, otherwise auto-assign.
    // 如果提供了显式 splatMapIndex 则使用，否则自动分配
    const splatMapIndex = layerDef.splatMapIndex ?? Math.floor(i / LAYERS_PER_SPLAT_MAP);
    const channel = (i % LAYERS_PER_SPLAT_MAP) as 0 | 1 | 2 | 3;

    assignments.push({
      layerName,
      layerIndex: i,
      splatMapIndex: Math.min(splatMapIndex, MAX_SPLAT_MAPS - 1),
      channel,
    });
  }

  return assignments;
}

/**
 * Get the number of splat maps needed for a texture definition.
 * 获取纹理定义所需的 splat map 数量
 */
export function getSplatMapCount(def: TextureDefinition): number {
  const assignments = computeLayerAssignments(def);
  if (assignments.length === 0) return 1;
  return Math.max(...assignments.map(a => a.splatMapIndex)) + 1;
}

/**
 * Create default splat map (100% first texture everywhere).
 * 创建默认 splat map（全部显示第1个纹理）
 *
 * @param splatMapIndex - Which splat map this is (affects default values)
 */
export function createDefaultSplatMap(
  resolution: number = 1024,
  splatMapIndex: number = 0,
): SplatMapData {
  const pixels = new Uint8Array(resolution * resolution * 4);

  if (splatMapIndex === 0) {
    // First splat map: R=255 (100% first texture)
    // 第一个 splat map：R=255（100% 第一个纹理）
    for (let i = 0; i < pixels.length; i += 4) {
      pixels[i] = 255;     // R = layer 0
      pixels[i + 1] = 0;   // G = layer 1
      pixels[i + 2] = 0;   // B = layer 2
      pixels[i + 3] = 0;   // A = layer 3
    }
  } else {
    // Other splat maps: all zeros (no contribution)
    // 其他 splat map：全零（无贡献）
    pixels.fill(0);
  }

  return { resolution, pixels, splatMapIndex };
}

/**
 * Get texture layer names in order (determines channel assignment).
 * 获取纹理层名称顺序（决定通道分配）
 */
export function getLayerNames(def: TextureDefinition): string[] {
  return Object.keys(def);
}

/**
 * Get splat map index and channel for a layer by name.
 * 通过名称获取层的 splat map 索引和通道
 */
export function getSplatInfoForLayer(
  layerName: string,
  def: TextureDefinition
): { splatMapIndex: number; channel: 0 | 1 | 2 | 3 } | null {
  const assignments = computeLayerAssignments(def);
  const assignment = assignments.find(a => a.layerName === layerName);
  if (!assignment) return null;
  return { splatMapIndex: assignment.splatMapIndex, channel: assignment.channel };
}

/**
 * Get global layer index for a layer by name.
 * 通过名称获取层的全局索引
 */
export function getLayerIndexForLayer(
  layerName: string,
  def: TextureDefinition
): number {
  const assignments = computeLayerAssignments(def);
  const assignment = assignments.find(a => a.layerName === layerName);
  return assignment?.layerIndex ?? -1;
}

/**
 * Get splat map index and channel for a layer by global index.
 * 通过全局索引获取层的 splat map 索引和通道
 */
export function getSplatInfoForLayerIndex(
  layerIndex: number,
  def: TextureDefinition
): { splatMapIndex: number; channel: 0 | 1 | 2 | 3 } | null {
  const assignments = computeLayerAssignments(def);
  const assignment = assignments.find(a => a.layerIndex === layerIndex);
  if (!assignment) return null;
  return { splatMapIndex: assignment.splatMapIndex, channel: assignment.channel };
}

/**
 * @deprecated Use getSplatInfoForLayer instead
 * Get channel index for a layer name (0-3 based on key order).
 * Returns -1 if layer not found or index >= 4.
 * 获取层名称的通道索引（基于键顺序，0-3）
 */
export function getChannelForLayer(
  layerName: string,
  def: TextureDefinition
): 0 | 1 | 2 | 3 | -1 {
  const info = getSplatInfoForLayer(layerName, def);
  if (!info) return -1;
  return info.channel;
}

/**
 * Get layer name for a channel index (0-3).
 * Returns null if no layer at that index.
 * @deprecated Use computeLayerAssignments for multi-splat support
 * 获取通道索引对应的层名称
 */
export function getLayerForChannel(
  channel: 0 | 1 | 2 | 3,
  def: TextureDefinition
): string | null {
  const names = Object.keys(def);
  return names[channel] ?? null;
}

function normalizeTextureDefinition(value: Record<string, unknown>): TextureDefinition {
  const layers: TextureDefinition = {};
  for (const [layerName, rawLayer] of Object.entries(value)) {
    if (!isRecord(rawLayer)) {
      throw new Error(`Paint layer '${layerName}' must be a JSON object`);
    }

    const diffuse = readRequiredString(rawLayer.diffuse, `Paint layer '${layerName}' diffuse texture`);
    layers[layerName] = {
      diffuse,
      ...readOptionalStringField(rawLayer, "normal"),
      ...readOptionalStringField(rawLayer, "displacement"),
      ...readOptionalStringField(rawLayer, "arm"),
      ...readOptionalStringField(rawLayer, "ao"),
      ...readOptionalStringField(rawLayer, "roughness"),
      ...readOptionalStringField(rawLayer, "metallic"),
      ...readOptionalPositiveNumberField(rawLayer, "scale", `Paint layer '${layerName}' scale`),
      ...readOptionalSplatMapIndexField(rawLayer, layerName),
    };
  }

  return layers;
}

function readRequiredString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${label} must be a non-empty string`);
  }

  return value;
}

function readOptionalStringField(record: Record<string, unknown>, field: keyof TextureLayerDef): Partial<TextureLayerDef> {
  const value = record[field];
  if (value === undefined) {
    return {};
  }

  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Paint layer field '${field}' must be a non-empty string`);
  }

  return { [field]: value } as Partial<TextureLayerDef>;
}

function readOptionalPositiveNumberField(
  record: Record<string, unknown>,
  field: keyof TextureLayerDef,
  label: string,
): Partial<TextureLayerDef> {
  const value = record[field];
  if (value === undefined) {
    return {};
  }

  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} must be a positive finite number`);
  }

  return { [field]: value } as Partial<TextureLayerDef>;
}

function readOptionalSplatMapIndexField(
  record: Record<string, unknown>,
  layerName: string,
): Partial<TextureLayerDef> {
  const value = record.splatMapIndex;
  if (value === undefined) {
    return {};
  }

  if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value >= MAX_SPLAT_MAPS) {
    throw new Error(`Paint layer '${layerName}' has invalid splat map index`);
  }

  return { splatMapIndex: value };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
