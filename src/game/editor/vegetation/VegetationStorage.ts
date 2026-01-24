// VegetationStorage: Load and save vegetation definitions and density maps.
// VegetationStorage：加载和保存植被定义和密度贴图

import { invoke } from "@tauri-apps/api/core";
import {
  type VegetationDefinition,
  type VegetationDensityMap,
  createDefaultDensityMap,
  validateVegetationDefinition,
} from "./VegetationData";

/**
 * Vegetation storage manager for loading/saving vegetation.json and vegetation-density.png.
 * 植被存储管理器，用于加载/保存 vegetation.json 和 vegetation-density.png
 */
export class VegetationStorage {
  /**
   * Load vegetation definition from project folder.
   * Returns null if vegetation.json doesn't exist.
   * 从项目文件夹加载植被定义
   * 如果 vegetation.json 不存在则返回 null
   */
  static async loadVegetationDefinition(projectPath: string): Promise<VegetationDefinition | null> {
    try {
      const jsonPath = `${projectPath}/vegetation.json`;
      const content = await invoke<string>("read_text_file", { path: jsonPath });
      const definition = JSON.parse(content) as VegetationDefinition;

      // Validate definition.
      // 验证定义
      const errors = validateVegetationDefinition(definition);
      if (errors.length > 0) {
        console.warn("[VegetationStorage] Validation warnings:", errors);
      }

      return definition;
    } catch {
      return null;
    }
  }

  /**
   * Save vegetation definition to project folder.
   * 保存植被定义到项目文件夹
   */
  static async saveVegetationDefinition(
    projectPath: string,
    definition: VegetationDefinition
  ): Promise<void> {
    const jsonPath = `${projectPath}/vegetation.json`;
    const content = JSON.stringify(definition, null, 2);
    await invoke("write_text_file", { path: jsonPath, content });
  }

  /**
   * Load density map from project folder.
   * 从项目文件夹加载密度贴图
   */
  static async loadDensityMap(projectPath: string): Promise<VegetationDensityMap | null> {
    try {
      const pngPath = `${projectPath}/vegetation-density.png`;

      // Read PNG file as base64 and decode.
      // 读取 PNG 文件为 base64 并解码
      const base64 = await invoke<string>("read_binary_file_base64", { path: pngPath });

      // Decode PNG using browser APIs with premultiplyAlpha: 'none' to preserve RGB when A=0.
      // 使用浏览器 API 解码 PNG，设置 premultiplyAlpha: 'none' 以在 A=0 时保留 RGB
      const blob = await fetch(`data:image/png;base64,${base64}`).then((r) => r.blob());
      const bitmap = await createImageBitmap(blob, { premultiplyAlpha: "none" });

      // Extract pixel data.
      // 提取像素数据
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
      const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
      ctx.drawImage(bitmap, 0, 0);
      const imageData = ctx.getImageData(0, 0, bitmap.width, bitmap.height);

      // Restore A channel from saved format.
      // For density maps, we save with A=255 to avoid PNG premultiplied alpha issues.
      // 从保存格式恢复 A 通道
      // 对于密度贴图，我们保存时设置 A=255 以避免 PNG 预乘 alpha 问题
      const pixels = new Uint8Array(imageData.data);

      return {
        resolution: bitmap.width,
        pixels,
      };
    } catch {
      return null;
    }
  }

  /**
   * Save density map to project folder as PNG.
   * 保存密度贴图到项目文件夹为 PNG
   *
   * NOTE: We set A=255 for all pixels to avoid premultiplied alpha issues in PNG.
   * 注意：我们将所有像素的 A 设置为 255 以避免 PNG 中的预乘 alpha 问题
   */
  static async saveDensityMap(
    projectPath: string,
    densityMap: VegetationDensityMap
  ): Promise<void> {
    const { resolution, pixels } = densityMap;

    // Create a copy with A=255 to avoid premultiplied alpha issues.
    // 创建一个 A=255 的副本以避免预乘 alpha 问题
    const pixelsWithAlpha = new Uint8ClampedArray(pixels.length);
    for (let i = 0; i < pixels.length; i += 4) {
      pixelsWithAlpha[i] = pixels[i];         // R
      pixelsWithAlpha[i + 1] = pixels[i + 1]; // G
      pixelsWithAlpha[i + 2] = pixels[i + 2]; // B
      pixelsWithAlpha[i + 3] = 255;           // A = 255 (force opaque)
    }

    // Create canvas and draw pixel data.
    // 创建 canvas 并绘制像素数据
    const canvas = new OffscreenCanvas(resolution, resolution);
    const ctx = canvas.getContext("2d")!;
    const imageData = new ImageData(pixelsWithAlpha, resolution, resolution);
    ctx.putImageData(imageData, 0, 0);

    // Convert to PNG blob.
    // 转换为 PNG blob
    const blob = await canvas.convertToBlob({ type: "image/png" });
    const arrayBuffer = await blob.arrayBuffer();

    // Convert ArrayBuffer to base64 without spread operator to avoid stack overflow.
    // 转换 ArrayBuffer 为 base64，不使用扩展运算符以避免栈溢出
    const bytes = new Uint8Array(arrayBuffer);
    let binary = "";
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    const base64 = btoa(binary);

    // Save via Tauri backend.
    // 通过 Tauri 后端保存
    const pngPath = `${projectPath}/vegetation-density.png`;
    await invoke("write_binary_file_base64", { path: pngPath, base64 });
  }

  /**
   * Create default density map for a project (if vegetation.json exists but density map doesn't).
   * 为项目创建默认密度贴图（如果 vegetation.json 存在但密度贴图不存在）
   */
  static async ensureDensityMap(
    projectPath: string,
    resolution: number = 1024
  ): Promise<void> {
    try {
      await invoke<string>("read_binary_file_base64", {
        path: `${projectPath}/vegetation-density.png`,
      });
    } catch {
      const defaultDensityMap = createDefaultDensityMap(resolution);
      await this.saveDensityMap(projectPath, defaultDensityMap);
    }
  }

  /**
   * Check if a project has vegetation configuration.
   * 检查项目是否有植被配置
   */
  static async hasVegetationConfig(projectPath: string): Promise<boolean> {
    try {
      await invoke<string>("read_text_file", { path: `${projectPath}/vegetation.json` });
      return true;
    } catch {
      return false;
    }
  }
}
