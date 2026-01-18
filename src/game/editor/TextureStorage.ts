// TextureStorage: Load and save texture definitions and splat maps.
// TextureStorage：加载和保存纹理定义和 splat map

import { invoke } from "@tauri-apps/api/core";
import {
  type TextureDefinition,
  type SplatMapData,
  createDefaultSplatMap,
} from "./TextureData";

/**
 * Texture storage manager for loading/saving texture.json and splatmap.png.
 * 纹理存储管理器，用于加载/保存 texture.json 和 splatmap.png
 */
export class TextureStorage {
  /**
   * Load texture definition from project folder.
   * Returns null if texture.json doesn't exist (use procedural textures).
   * 从项目文件夹加载纹理定义
   * 如果 texture.json 不存在则返回 null（使用程序纹理）
   */
  static async loadTextureDefinition(projectPath: string): Promise<TextureDefinition | null> {
    try {
      const jsonPath = `${projectPath}/texture.json`;
      const content = await invoke<string>("read_text_file", { path: jsonPath });
      return JSON.parse(content) as TextureDefinition;
    } catch {
      return null;
    }
  }

  /**
   * Save texture definition to project folder.
   * 保存纹理定义到项目文件夹
   */
  static async saveTextureDefinition(
    projectPath: string,
    definition: TextureDefinition,
  ): Promise<void> {
    const jsonPath = `${projectPath}/texture.json`;
    const content = JSON.stringify(definition, null, 2);
    await invoke("write_text_file", { path: jsonPath, content });
    console.log("[TextureStorage] Saved texture.json");
  }

  /**
   * Load splat map from project folder.
   * 从项目文件夹加载 splat map
   */
  static async loadSplatMap(projectPath: string): Promise<SplatMapData | null> {
    try {
      const pngPath = `${projectPath}/splatmap.png`;

      // Read PNG file as base64 and decode.
      // 读取 PNG 文件为 base64 并解码
      const base64 = await invoke<string>("read_binary_file_base64", { path: pngPath });

      // Decode PNG using browser APIs with premultiplyAlpha: 'none' to preserve RGB when A=0.
      // 使用浏览器 API 解码 PNG，设置 premultiplyAlpha: 'none' 以在 A=0 时保留 RGB
      const blob = await fetch(`data:image/png;base64,${base64}`).then((r) => r.blob());
      const bitmap = await createImageBitmap(blob, { premultiplyAlpha: "none" });

      // Extract pixel data using willReadFrequently for better performance.
      // 使用 willReadFrequently 提取像素数据以获得更好的性能
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
      const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
      ctx.drawImage(bitmap, 0, 0);
      const imageData = ctx.getImageData(0, 0, bitmap.width, bitmap.height);

      return {
        resolution: bitmap.width,
        pixels: new Uint8Array(imageData.data),
      };
    } catch {
      return null;
    }
  }

  /**
   * Save splat map to project folder as PNG.
   * 保存 splat map 到项目文件夹为 PNG
   *
   * NOTE: We set A=255 for all pixels to avoid premultiplied alpha issues in PNG.
   * When A=0, browsers will zero out RGB during PNG encoding.
   * 注意：我们将所有像素的 A 设置为 255 以避免 PNG 中的预乘 alpha 问题。
   * 当 A=0 时，浏览器会在 PNG 编码期间将 RGB 归零。
   */
  static async saveSplatMap(projectPath: string, splatMap: SplatMapData): Promise<void> {
    const { resolution, pixels } = splatMap;

    // Create a copy with A=255 to avoid premultiplied alpha issues.
    // 创建一个 A=255 的副本以避免预乘 alpha 问题
    const pixelsWithAlpha = new Uint8ClampedArray(pixels.length);
    for (let i = 0; i < pixels.length; i += 4) {
      pixelsWithAlpha[i] = pixels[i];       // R
      pixelsWithAlpha[i + 1] = pixels[i + 1]; // G
      pixelsWithAlpha[i + 2] = pixels[i + 2]; // B
      pixelsWithAlpha[i + 3] = 255;          // A = 255 (force opaque)
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
    const pngPath = `${projectPath}/splatmap.png`;
    await invoke("write_binary_file_base64", { path: pngPath, base64 });
  }

  /**
   * Create default splat map for a project (if texture.json exists but splatmap.png doesn't).
   * 为项目创建默认 splat map（如果 texture.json 存在但 splatmap.png 不存在）
   */
  static async ensureSplatMap(projectPath: string, resolution: number = 1024): Promise<void> {
    try {
      await invoke<string>("read_binary_file_base64", { path: `${projectPath}/splatmap.png` });
    } catch {
      const defaultSplatMap = createDefaultSplatMap(resolution);
      await this.saveSplatMap(projectPath, defaultSplatMap);
    }
  }
}
