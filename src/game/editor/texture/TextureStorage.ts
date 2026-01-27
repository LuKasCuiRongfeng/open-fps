// TextureStorage: Load and save texture definitions and splat maps.
// TextureStorage：加载和保存纹理定义和 splat map

import { invoke } from "@tauri-apps/api/core";
import {
  type TextureDefinition,
  type SplatMapData,
  createDefaultSplatMap,
} from "./TextureData";

/**
 * Get splat map filename for a given index.
 * 获取给定索引的 splat map 文件名
 */
function getSplatMapFilename(index: number): string {
  return index === 0 ? "splatmap.png" : `splatmap_${index}.png`;
}

/**
 * Convert Uint8Array to base64 string (without stack overflow for large arrays).
 * 将 Uint8Array 转换为 base64 字符串（大数组不会栈溢出）
 */
function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Convert base64 string to Uint8Array.
 * 将 base64 字符串转换为 Uint8Array
 */
function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Texture storage manager for loading/saving texture.json and splatmap files.
 * 纹理存储管理器，用于加载/保存 texture.json 和 splatmap 文件
 *
 * Supports multiple splat maps: splatmap.png, splatmap_1.png, splatmap_2.png, etc.
 * 支持多个 splat map：splatmap.png、splatmap_1.png、splatmap_2.png 等
 *
 * Uses native Tauri PNG read/write to bypass browser's premultiplied alpha issue.
 * 使用原生 Tauri PNG 读写来绕过浏览器的预乘 alpha 问题
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
  }

  /**
   * Load splat map from project folder using native PNG decoder.
   * 使用原生 PNG 解码器从项目文件夹加载 splat map
   *
   * Uses Tauri backend to read PNG, bypassing browser's premultiplied alpha issue.
   * 使用 Tauri 后端读取 PNG，绕过浏览器的预乘 alpha 问题
   *
   * @param splatMapIndex Which splat map to load (0 = splatmap.png, 1 = splatmap_1.png, etc.)
   */
  static async loadSplatMap(
    projectPath: string,
    splatMapIndex: number = 0,
  ): Promise<SplatMapData | null> {
    try {
      const filename = getSplatMapFilename(splatMapIndex);
      const pngPath = `${projectPath}/${filename}`;

      // Use native Tauri PNG decoder to get raw RGBA pixels.
      // 使用原生 Tauri PNG 解码器获取原始 RGBA 像素
      const [base64Pixels, width, _height] = await invoke<[string, number, number]>(
        "read_png_rgba",
        { path: pngPath }
      );

      const pixels = base64ToUint8Array(base64Pixels);

      // Migrate old format: if ALL pixels have A=255, convert to A=0.
      // This handles splatmaps saved with the old code that set A=255 as placeholder.
      // 迁移旧格式：如果所有像素的 A=255，转换为 A=0
      // 这处理旧代码保存的 splatmap（使用 A=255 作为占位符）
      let allAlpha255 = true;
      for (let i = 3; i < pixels.length; i += 4) {
        if (pixels[i] !== 255) {
          allAlpha255 = false;
          break;
        }
      }
      if (allAlpha255 && splatMapIndex === 0) {
        console.log(`[TextureStorage] Migrating old splatmap format (A=255 → A=0)`);
        for (let i = 3; i < pixels.length; i += 4) {
          pixels[i] = 0;
        }
      }

      return {
        resolution: width,
        pixels,
        splatMapIndex,
      };
    } catch {
      return null;
    }
  }

  /**
   * Save splat map to project folder as PNG using native encoder.
   * 使用原生编码器保存 splat map 到项目文件夹为 PNG
   *
   * Uses Tauri backend to write PNG, bypassing browser's premultiplied alpha issue.
   * This preserves all 4 RGBA channels correctly (including A channel for 4th texture).
   * 使用 Tauri 后端写入 PNG，绕过浏览器的预乘 alpha 问题
   * 这样可以正确保存所有 4 个 RGBA 通道（包括第 4 种纹理的 A 通道）
   *
   * @param splatMapIndex Which splat map to save (0 = splatmap.png, 1 = splatmap_1.png, etc.)
   */
  static async saveSplatMap(
    projectPath: string,
    splatMap: SplatMapData,
    splatMapIndex: number = 0,
  ): Promise<void> {
    const { resolution, pixels } = splatMap;
    const filename = getSplatMapFilename(splatMapIndex);
    const pngPath = `${projectPath}/${filename}`;

    // Use native Tauri PNG encoder to save raw RGBA pixels.
    // 使用原生 Tauri PNG 编码器保存原始 RGBA 像素
    const base64Pixels = uint8ArrayToBase64(pixels);

    await invoke("write_png_rgba", {
      path: pngPath,
      base64Pixels,
      width: resolution,
      height: resolution,
    });
  }

  /**
   * Create default splat map for a project (if texture.json exists but splatmap.png doesn't).
   * 为项目创建默认 splat map（如果 texture.json 存在但 splatmap.png 不存在）
   *
   * @param splatMapIndex Which splat map to ensure (0 = splatmap.png, 1 = splatmap_1.png, etc.)
   */
  static async ensureSplatMap(
    projectPath: string,
    splatMapIndex: number = 0,
    resolution: number = 1024,
  ): Promise<void> {
    const filename = getSplatMapFilename(splatMapIndex);
    try {
      // Check if file exists by trying to read it.
      // 尝试读取文件来检查是否存在
      await invoke<[string, number, number]>("read_png_rgba", {
        path: `${projectPath}/${filename}`,
      });
    } catch {
      const defaultSplatMap = createDefaultSplatMap(resolution, splatMapIndex);
      await this.saveSplatMap(projectPath, defaultSplatMap, splatMapIndex);
    }
  }
}
