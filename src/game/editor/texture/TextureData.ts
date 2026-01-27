// TextureData: Data structures for terrain texture painting system.
// TextureData：地形纹理绘制系统的数据结构

/**
 * PBR texture layer definition.
 * Each layer can have multiple maps for physically-based rendering.
 * PBR 纹理层定义
 * 每层可包含多张贴图用于物理渲染
 *
 * Example texture.json:
 * {
 *   "rocky": {
 *     "diffuse": "assets/textures/rocky_diffuse.jpg",
 *     "normal": "assets/textures/rocky_normal.jpg",
 *     "ao": "assets/textures/rocky_ao.jpg"
 *   },
 *   "grass": {
 *     "diffuse": "assets/textures/grass_diffuse.jpg",
 *     "normal": "assets/textures/grass_normal.jpg"
 *   }
 * }
 *
 * Splat map channels are AUTO-ASSIGNED by key order:
 * - 1st key (rocky) → R channel (0)
 * - 2nd key (grass) → G channel (1)
 * - 3rd key → B channel (2)
 * - 4th key → A channel (3)
 * Maximum 4 texture layers supported.
 *
 * Splat map 通道按键顺序自动分配：
 * - 第1个键 → R 通道 (0)
 * - 第2个键 → G 通道 (1)
 * - 第3个键 → B 通道 (2)
 * - 第4个键 → A 通道 (3)
 * 最多支持 4 个纹理层
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
}

/**
 * texture.json structure.
 * Keys = texture layer names, values = PBR map definitions.
 * If file doesn't exist → use procedural textures, editing disabled.
 * texture.json 结构
 * 键 = 纹理层名称，值 = PBR 贴图定义
 * 如果文件不存在 → 使用程序纹理，禁用编辑
 */
export type TextureDefinition = Record<string, TextureLayerDef>;

/**
 * Splat map data for terrain texture blending.
 * 地形纹理混合的 splat map 数据
 *
 * Each pixel's RGBA values are blend weights (0-255):
 * - R = weight for layer 0 (1st texture)
 * - G = weight for layer 1 (2nd texture)
 * - B = weight for layer 2 (3rd texture)
 * - A = weight for layer 3 (4th texture)
 *
 * 每像素的 RGBA 值是混合权重（0-255）：
 * - R = 层0的权重（第1个纹理）
 * - G = 层1的权重（第2个纹理）
 * - B = 层2的权重（第3个纹理）
 * - A = 层3的权重（第4个纹理）
 */
export interface SplatMapData {
  resolution: number;
  pixels: Uint8Array;
}

/**
 * Create default splat map (100% first texture everywhere).
 * 创建默认 splat map（全部显示第1个纹理）
 */
export function createDefaultSplatMap(resolution: number = 1024): SplatMapData {
  const pixels = new Uint8Array(resolution * resolution * 4);

  // R=255, G=0, B=0, A=0 means 100% first texture
  // R=255 表示 100% 第一个纹理
  for (let i = 0; i < pixels.length; i += 4) {
    pixels[i] = 255;     // R = layer 0
    pixels[i + 1] = 0;   // G = layer 1
    pixels[i + 2] = 0;   // B = layer 2
    pixels[i + 3] = 0;   // A = layer 3
  }

  return { resolution, pixels };
}

/**
 * Get texture layer names in order (determines channel assignment).
 * 获取纹理层名称顺序（决定通道分配）
 */
export function getLayerNames(def: TextureDefinition): string[] {
  return Object.keys(def);
}

/**
 * Get channel index for a layer name (0-3 based on key order).
 * Returns -1 if layer not found or index >= 4.
 * 获取层名称的通道索引（基于键顺序，0-3）
 */
export function getChannelForLayer(
  layerName: string,
  def: TextureDefinition
): 0 | 1 | 2 | 3 | -1 {
  const names = Object.keys(def);
  const idx = names.indexOf(layerName);
  if (idx < 0 || idx > 3) return -1;
  return idx as 0 | 1 | 2 | 3;
}

/**
 * Get layer name for a channel index (0-3).
 * Returns null if no layer at that index.
 * 获取通道索引对应的层名称
 */
export function getLayerForChannel(
  channel: 0 | 1 | 2 | 3,
  def: TextureDefinition
): string | null {
  const names = Object.keys(def);
  return names[channel] ?? null;
}
