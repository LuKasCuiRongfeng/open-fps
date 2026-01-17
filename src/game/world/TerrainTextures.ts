// TerrainTextures: Loads PBR texture layers from texture.json or provides procedural fallback.
// TerrainTextures：从 texture.json 加载 PBR 纹理层，或提供程序纹理作为后备

import {
  TextureLoader,
  RepeatWrapping,
  LinearMipmapLinearFilter,
  LinearFilter,
  SRGBColorSpace,
  LinearSRGBColorSpace,
  DataTexture,
  RGBAFormat,
  UnsignedByteType,
  type Texture,
} from "three/webgpu";
import type { TextureDefinition, TextureLayerDef } from "../editor/TextureData";

/**
 * Loaded PBR textures for a single layer.
 * 单个层的已加载 PBR 纹理
 */
export interface PBRTextureSet {
  diffuse: Texture;
  normal?: Texture;
  ao?: Texture;
  roughness?: Texture;
  displacement?: Texture;
  scale: number;
}

/**
 * Result of loading terrain textures.
 * 加载地形纹理的结果
 */
export interface TerrainTextureResult {
  /** Whether using real textures (true) or procedural fallback (false) */
  useTextures: boolean;
  /** Loaded texture layers (max 4), keyed by layer name */
  layers: Map<string, PBRTextureSet>;
  /** Layer names in order (determines splat map channel) */
  layerOrder: string[];
}

/**
 * Terrain texture loader - loads PBR textures from texture.json.
 * 地形纹理加载器 - 从 texture.json 加载 PBR 纹理
 *
 * If texture.json exists: load all PBR maps per layer
 * If not: return procedural fallback flag
 */
export class TerrainTextures {
  private static instance: TerrainTextures | null = null;
  private loader = new TextureLoader();
  private result: TerrainTextureResult | null = null;

  static getInstance(): TerrainTextures {
    if (!TerrainTextures.instance) {
      TerrainTextures.instance = new TerrainTextures();
    }
    return TerrainTextures.instance;
  }

  /**
   * Load textures from texture definition.
   * 从纹理定义加载纹理
   * @param projectPath Project folder path (for resolving relative texture paths)
   * @param definition Texture definition from texture.json (null = use procedural)
   */
  async loadFromDefinition(
    projectPath: string,
    definition: TextureDefinition | null,
  ): Promise<TerrainTextureResult> {
    if (!definition) {
      // No texture.json - use procedural textures.
      // 没有 texture.json - 使用程序纹理
      console.log("[TerrainTextures] No texture definition, using procedural textures");
      this.result = {
        useTextures: false,
        layers: new Map(),
        layerOrder: [],
      };
      return this.result;
    }

    const layerNames = Object.keys(definition).slice(0, 4); // Max 4 layers
    const layers = new Map<string, PBRTextureSet>();

    console.log(`[TerrainTextures] Loading ${layerNames.length} texture layers...`);

    for (const name of layerNames) {
      const layerDef = definition[name];
      const textures = await this.loadLayerTextures(projectPath, layerDef);
      layers.set(name, textures);
      console.log(`[TerrainTextures] Loaded layer: ${name}`);
    }

    this.result = {
      useTextures: true,
      layers,
      layerOrder: layerNames,
    };

    return this.result;
  }

  /**
   * Load all PBR textures for a single layer.
   * 为单个层加载所有 PBR 纹理
   */
  private async loadLayerTextures(
    projectPath: string,
    def: TextureLayerDef,
  ): Promise<PBRTextureSet> {
    const resolvePath = (p: string) => `${projectPath}/${p}`;

    // Load diffuse (required).
    // 加载漫反射（必需）
    const diffuse = await this.loadTexture(resolvePath(def.diffuse), true);

    // Load optional PBR maps.
    // 加载可选 PBR 贴图
    const normal = def.normal ? await this.loadTexture(resolvePath(def.normal), false) : undefined;
    const ao = def.ao ? await this.loadTexture(resolvePath(def.ao), false) : undefined;
    const roughness = def.roughness ? await this.loadTexture(resolvePath(def.roughness), false) : undefined;
    const displacement = def.displacement ? await this.loadTexture(resolvePath(def.displacement), false) : undefined;

    return {
      diffuse,
      normal,
      ao,
      roughness,
      displacement,
      scale: def.scale ?? 4,
    };
  }

  /**
   * Load a single texture with proper settings.
   * 加载单个纹理并设置正确的参数
   */
  private loadTexture(path: string, isSRGB: boolean): Promise<Texture> {
    return new Promise((resolve) => {
      this.loader.load(
        path,
        (tex) => {
          tex.wrapS = RepeatWrapping;
          tex.wrapT = RepeatWrapping;
          tex.minFilter = LinearMipmapLinearFilter;
          tex.magFilter = LinearFilter;
          tex.colorSpace = isSRGB ? SRGBColorSpace : LinearSRGBColorSpace;
          tex.generateMipmaps = true;
          resolve(tex);
        },
        undefined,
        (err) => {
          console.warn(`[TerrainTextures] Failed to load: ${path}`, err);
          // Return a fallback texture instead of rejecting.
          // 返回后备纹理而不是拒绝
          resolve(this.createFallbackTexture(isSRGB));
        },
      );
    });
  }

  /**
   * Create a fallback texture (magenta for errors).
   * 创建后备纹理（错误时显示品红色）
   */
  private createFallbackTexture(isSRGB: boolean): Texture {
    const size = 64;
    const data = new Uint8Array(size * size * 4);

    // Magenta checkerboard pattern for visibility.
    // 品红色棋盘格图案以便识别
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const i = (y * size + x) * 4;
        const checker = ((x >> 3) + (y >> 3)) & 1;
        data[i] = checker ? 255 : 128;     // R
        data[i + 1] = 0;                    // G
        data[i + 2] = checker ? 255 : 128; // B
        data[i + 3] = 255;                  // A
      }
    }

    const tex = new DataTexture(data, size, size, RGBAFormat, UnsignedByteType);
    tex.wrapS = RepeatWrapping;
    tex.wrapT = RepeatWrapping;
    tex.minFilter = LinearMipmapLinearFilter;
    tex.magFilter = LinearFilter;
    tex.colorSpace = isSRGB ? SRGBColorSpace : LinearSRGBColorSpace;
    tex.generateMipmaps = true;
    tex.needsUpdate = true;

    return tex;
  }

  /**
   * Get cached result (must call loadFromDefinition first).
   * 获取缓存结果（必须先调用 loadFromDefinition）
   */
  getResult(): TerrainTextureResult | null {
    return this.result;
  }

  /**
   * Create procedural texture for fallback.
   * 创建程序纹理作为后备
   */
  static createProceduralTexture(
    baseColor: [number, number, number],
    variation: number = 0.15,
    size: number = 256,
  ): Texture {
    const data = new Uint8Array(size * size * 4);

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const i = (y * size + x) * 4;

        // Simple noise variation.
        // 简单噪声变化
        const n1 = Math.sin(x * 0.1) * Math.sin(y * 0.1);
        const n2 = Math.sin(x * 0.23 + 1.5) * Math.sin(y * 0.19 + 0.7);
        const noise = (n1 + n2 * 0.5) / 1.5;
        const v = 1.0 + noise * variation;

        data[i] = Math.min(255, Math.max(0, baseColor[0] * 255 * v));
        data[i + 1] = Math.min(255, Math.max(0, baseColor[1] * 255 * v));
        data[i + 2] = Math.min(255, Math.max(0, baseColor[2] * 255 * v));
        data[i + 3] = 255;
      }
    }

    const tex = new DataTexture(data, size, size, RGBAFormat, UnsignedByteType);
    tex.wrapS = RepeatWrapping;
    tex.wrapT = RepeatWrapping;
    tex.minFilter = LinearMipmapLinearFilter;
    tex.magFilter = LinearFilter;
    tex.colorSpace = SRGBColorSpace;
    tex.generateMipmaps = true;
    tex.needsUpdate = true;

    return tex;
  }

  /**
   * Dispose all textures.
   * 释放所有纹理
   */
  dispose(): void {
    if (this.result) {
      for (const layer of this.result.layers.values()) {
        layer.diffuse.dispose();
        layer.normal?.dispose();
        layer.ao?.dispose();
        layer.roughness?.dispose();
        layer.displacement?.dispose();
      }
      this.result = null;
    }
    TerrainTextures.instance = null;
  }
}
