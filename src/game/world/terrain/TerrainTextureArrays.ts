// TerrainTextureArrays: Pack terrain PBR textures into DataArrayTexture for efficient GPU sampling.
// TerrainTextureArrays：将地形 PBR 纹理打包到 DataArrayTexture 以高效 GPU 采样

import {
  DataArrayTexture,
  RepeatWrapping,
  LinearMipmapLinearFilter,
  LinearFilter,
  SRGBColorSpace,
  LinearSRGBColorSpace,
  RGBAFormat,
  UnsignedByteType,
} from "three/webgpu";
import { convertFileSrc } from "@tauri-apps/api/core";
import {
  type TextureDefinition,
  type LayerAssignment,
  computeLayerAssignments,
  getSplatMapCount,
} from "../../editor/texture/TextureData";

/**
 * Texture array result - all PBR maps packed into texture arrays.
 * 纹理数组结果 - 所有 PBR 贴图打包到纹理数组
 *
 * Benefits / 优势:
 * - Only 4+ texture slots instead of N×4 (N layers × 4 maps each)
 *   只需 4+ 个纹理槽而非 N×4 个（N 层 × 每层 4 张贴图）
 * - Scalable to many layers without hitting WebGPU limits
 *   可扩展到多层而不会超出 WebGPU 限制
 * - Better GPU cache utilization
 *   更好的 GPU 缓存利用率
 */
export interface TerrainTextureArrayResult {
  /** Whether using real textures (true) or procedural fallback (false) */
  useTextures: boolean;

  /** Diffuse/albedo texture array (SRGB) / 漫反射纹理数组 */
  diffuseArray: DataArrayTexture | null;

  /** Normal map texture array (Linear) / 法线贴图纹理数组 */
  normalArray: DataArrayTexture | null;

  /** ARM (AO/Roughness/Metallic) texture array (Linear) / ARM 纹理数组 */
  armArray: DataArrayTexture | null;

  /** Displacement/height texture array (Linear) / 位移纹理数组 */
  displacementArray: DataArrayTexture | null;

  /** Number of texture layers / 纹理层数 */
  layerCount: number;

  /** Scale values for each layer / 每层的缩放值 */
  scales: number[];

  /** Layer names in order / 层名称顺序 */
  layerOrder: string[];

  /** Layer assignments (splat map index + channel for each layer) / 层分配 */
  layerAssignments: LayerAssignment[];

  /** Number of splat maps needed / 需要的 splat map 数量 */
  splatMapCount: number;
}

// Default texture size for array (all textures must be same size).
// 纹理数组的默认尺寸（所有纹理必须相同大小）
const TEXTURE_SIZE = 1024;

/**
 * Terrain texture array loader - packs PBR textures into DataArrayTexture.
 * 地形纹理数组加载器 - 将 PBR 纹理打包到 DataArrayTexture
 *
 * Supports unlimited texture layers via multi-splat-map system:
 * - Each splat map supports 4 texture layers (RGBA channels)
 * - Multiple splat maps allow scaling beyond 4 layers
 * 通过多 splat map 系统支持无限纹理层：
 * - 每个 splat map 支持 4 个纹理层（RGBA 通道）
 * - 多个 splat map 允许扩展到 4 层以上
 */
export class TerrainTextureArrays {
  private static instance: TerrainTextureArrays | null = null;
  private result: TerrainTextureArrayResult | null = null;

  static getInstance(): TerrainTextureArrays {
    if (!TerrainTextureArrays.instance) {
      TerrainTextureArrays.instance = new TerrainTextureArrays();
    }
    return TerrainTextureArrays.instance;
  }

  /**
   * Load textures from texture definition and pack into arrays.
   * 从纹理定义加载纹理并打包到数组
   */
  async loadFromDefinition(
    projectPath: string,
    definition: TextureDefinition | null,
  ): Promise<TerrainTextureArrayResult> {
    if (!definition) {
      // No texture.json - use procedural textures.
      // 没有 texture.json - 使用程序纹理
      this.result = {
        useTextures: false,
        diffuseArray: null,
        normalArray: null,
        armArray: null,
        displacementArray: null,
        layerCount: 0,
        scales: [],
        layerOrder: [],
        layerAssignments: [],
        splatMapCount: 1,
      };
      return this.result;
    }

    // Compute layer assignments (which splat map + channel each layer uses).
    // 计算层分配（每层使用哪个 splat map + 通道）
    const layerAssignments = computeLayerAssignments(definition);
    const splatMapCount = getSplatMapCount(definition);
    const layerNames = layerAssignments.map(a => a.layerName);
    const layerCount = layerNames.length;
    const scales: number[] = [];

    // Pre-allocate arrays for all texture data.
    // 预分配所有纹理数据的数组
    const diffuseData = new Uint8Array(TEXTURE_SIZE * TEXTURE_SIZE * 4 * layerCount);
    const normalData = new Uint8Array(TEXTURE_SIZE * TEXTURE_SIZE * 4 * layerCount);
    const armData = new Uint8Array(TEXTURE_SIZE * TEXTURE_SIZE * 4 * layerCount);
    const displacementData = new Uint8Array(TEXTURE_SIZE * TEXTURE_SIZE * 4 * layerCount);

    // Load each layer's textures and copy into arrays.
    // 加载每层的纹理并复制到数组
    for (let i = 0; i < layerCount; i++) {
      const layerDef = definition[layerNames[i]];
      scales.push(layerDef.scale ?? 4);

      const offset = i * TEXTURE_SIZE * TEXTURE_SIZE * 4;

      // Load and copy diffuse.
      // 加载并复制漫反射
      const diffusePixels = await this.loadTextureData(
        projectPath,
        layerDef.diffuse,
        true,
      );
      diffuseData.set(diffusePixels, offset);

      // Load and copy normal (or use flat normal).
      // 加载并复制法线（或使用平面法线）
      if (layerDef.normal) {
        const normalPixels = await this.loadTextureData(projectPath, layerDef.normal, false);
        normalData.set(normalPixels, offset);
      } else {
        // Flat normal: RGB(128, 128, 255) = (0, 0, 1) in tangent space.
        // 平面法线：RGB(128, 128, 255) = 切线空间中的 (0, 0, 1)
        this.fillFlatNormal(normalData, offset);
      }

      // Load and copy ARM.
      // 加载并复制 ARM
      if (layerDef.arm) {
        const armPixels = await this.loadTextureData(projectPath, layerDef.arm, false);
        armData.set(armPixels, offset);
      } else {
        // Default ARM: AO=1, Roughness=0.8, Metallic=0.
        // 默认 ARM：AO=1, Roughness=0.8, Metallic=0
        this.fillDefaultARM(armData, offset);
      }

      // Load and copy displacement.
      // 加载并复制位移
      if (layerDef.displacement) {
        const dispPixels = await this.loadTextureData(projectPath, layerDef.displacement, false);
        displacementData.set(dispPixels, offset);
      } else {
        // Flat displacement: 128 (middle gray = no displacement).
        // 平面位移：128（中灰色 = 无位移）
        this.fillFlatDisplacement(displacementData, offset);
      }
    }

    // Create DataArrayTextures.
    // 创建 DataArrayTexture
    const diffuseArray = this.createTextureArray(diffuseData, layerCount, true);
    const normalArray = this.createTextureArray(normalData, layerCount, false);
    const armArray = this.createTextureArray(armData, layerCount, false);
    const displacementArray = this.createTextureArray(displacementData, layerCount, false);

    this.result = {
      useTextures: true,
      diffuseArray,
      normalArray,
      armArray,
      displacementArray,
      layerCount,
      scales,
      layerOrder: layerNames,
      layerAssignments,
      splatMapCount,
    };

    console.log(
      `[TerrainTextureArrays] Loaded ${layerCount} layers into texture arrays, ` +
      `using ${splatMapCount} splat map(s)`
    );
    return this.result;
  }

  /**
   * Load a texture and return its pixel data resized to TEXTURE_SIZE.
   * 加载纹理并返回调整大小后的像素数据
   */
  private async loadTextureData(
    projectPath: string,
    relativePath: string,
    isSRGB: boolean,
  ): Promise<Uint8Array> {
    const url = convertFileSrc(`${projectPath}/${relativePath}`);

    try {
      const response = await fetch(url);
      const blob = await response.blob();
      const bitmap = await createImageBitmap(blob);

      // Resize to TEXTURE_SIZE using canvas.
      // 使用 canvas 调整大小到 TEXTURE_SIZE
      const canvas = new OffscreenCanvas(TEXTURE_SIZE, TEXTURE_SIZE);
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(bitmap, 0, 0, TEXTURE_SIZE, TEXTURE_SIZE);
      const imageData = ctx.getImageData(0, 0, TEXTURE_SIZE, TEXTURE_SIZE);

      bitmap.close();
      return new Uint8Array(imageData.data);
    } catch (err) {
      console.warn(`[TerrainTextureArrays] Failed to load: ${url}`, err);
      // Return fallback (magenta for diffuse, appropriate defaults for others).
      // 返回后备（漫反射用品红色，其他用适当的默认值）
      return this.createFallbackData(isSRGB);
    }
  }

  /**
   * Create a DataArrayTexture from packed pixel data.
   * 从打包的像素数据创建 DataArrayTexture
   */
  private createTextureArray(
    data: Uint8Array,
    depth: number,
    isSRGB: boolean,
  ): DataArrayTexture {
    const tex = new DataArrayTexture(data, TEXTURE_SIZE, TEXTURE_SIZE, depth);
    tex.format = RGBAFormat;
    tex.type = UnsignedByteType;
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
   * Fill a layer with flat normal (pointing up in tangent space).
   * 用平面法线填充一层（切线空间中指向上）
   */
  private fillFlatNormal(data: Uint8Array, offset: number): void {
    const layerSize = TEXTURE_SIZE * TEXTURE_SIZE * 4;
    for (let i = 0; i < layerSize; i += 4) {
      data[offset + i] = 128;     // R = 0 (normalized)
      data[offset + i + 1] = 128; // G = 0 (normalized)
      data[offset + i + 2] = 255; // B = 1 (pointing up)
      data[offset + i + 3] = 255; // A
    }
  }

  /**
   * Fill a layer with default ARM values.
   * 用默认 ARM 值填充一层
   */
  private fillDefaultARM(data: Uint8Array, offset: number): void {
    const layerSize = TEXTURE_SIZE * TEXTURE_SIZE * 4;
    for (let i = 0; i < layerSize; i += 4) {
      data[offset + i] = 255;     // R = AO = 1.0
      data[offset + i + 1] = 204; // G = Roughness = 0.8
      data[offset + i + 2] = 0;   // B = Metallic = 0
      data[offset + i + 3] = 255; // A
    }
  }

  /**
   * Fill a layer with flat displacement (neutral height).
   * 用平面位移填充一层（中性高度）
   */
  private fillFlatDisplacement(data: Uint8Array, offset: number): void {
    const layerSize = TEXTURE_SIZE * TEXTURE_SIZE * 4;
    for (let i = 0; i < layerSize; i += 4) {
      data[offset + i] = 128;     // R = 0.5 (neutral)
      data[offset + i + 1] = 128; // G
      data[offset + i + 2] = 128; // B
      data[offset + i + 3] = 255; // A
    }
  }

  /**
   * Create fallback texture data (magenta checkerboard).
   * 创建后备纹理数据（品红色棋盘格）
   */
  private createFallbackData(isSRGB: boolean): Uint8Array {
    const data = new Uint8Array(TEXTURE_SIZE * TEXTURE_SIZE * 4);
    for (let y = 0; y < TEXTURE_SIZE; y++) {
      for (let x = 0; x < TEXTURE_SIZE; x++) {
        const i = (y * TEXTURE_SIZE + x) * 4;
        const checker = ((x >> 5) + (y >> 5)) & 1;
        if (isSRGB) {
          // Magenta checkerboard for visibility.
          // 品红色棋盘格以便识别
          data[i] = checker ? 255 : 128;
          data[i + 1] = 0;
          data[i + 2] = checker ? 255 : 128;
        } else {
          // Gray for non-color data.
          // 非颜色数据用灰色
          data[i] = 128;
          data[i + 1] = 128;
          data[i + 2] = 128;
        }
        data[i + 3] = 255;
      }
    }
    return data;
  }

  /**
   * Get cached result (must call loadFromDefinition first).
   * 获取缓存结果（必须先调用 loadFromDefinition）
   */
  getResult(): TerrainTextureArrayResult | null {
    return this.result;
  }

  /**
   * Dispose all texture arrays.
   * 释放所有纹理数组
   */
  dispose(): void {
    if (this.result) {
      this.result.diffuseArray?.dispose();
      this.result.normalArray?.dispose();
      this.result.armArray?.dispose();
      this.result.displacementArray?.dispose();
      this.result = null;
    }
    TerrainTextureArrays.instance = null;
  }
}
