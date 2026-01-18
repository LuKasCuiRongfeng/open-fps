// WebGpuBackend: Centralized accessor for Three.js WebGPU backend internals.
// WebGpuBackend：Three.js WebGPU 后端内部的集中访问器
//
// Three.js does not expose an official API for accessing the underlying WebGPU device
// or GPU texture handles. This module provides a centralized, type-safe accessor
// that isolates the unavoidable internal API access to a single location.
// Three.js 没有暴露用于访问底层 WebGPU 设备或 GPU 纹理句柄的官方 API。
// 此模块提供了一个集中的、类型安全的访问器，将不可避免的内部 API 访问隔离到单一位置。
//
// WHY THIS IS NECESSARY:
// 为什么这是必要的：
// - GPU texture readback requires native WebGPU APIs (staging buffers, copyTextureToBuffer)
// - GPU 纹理回读需要原生 WebGPU API（暂存缓冲区、copyTextureToBuffer）
// - Three.js StorageTexture is write-only in compute shaders
// - Three.js StorageTexture 在 compute shader 中是只写的
// - There is no renderer.readTexturePixels() or similar API in Three.js WebGPU
// - Three.js WebGPU 中没有 renderer.readTexturePixels() 或类似的 API
//
// USAGE:
// 用法：
//   const backend = WebGpuBackend.from(renderer);
//   if (backend) {
//     const gpuTexture = backend.getTextureGPU(texture);
//     // ... use backend.device for WebGPU operations
//   }

import type { WebGPURenderer, Texture } from "three/webgpu";

/**
 * Type-safe interface for Three.js WebGPU backend internals.
 * Three.js WebGPU 后端内部的类型安全接口
 */
export interface WebGpuBackendHandle {
  /** WebGPU device. / WebGPU 设备 */
  readonly device: GPUDevice;
  
  /**
   * Get the native GPUTexture from a Three.js texture.
   * 从 Three.js 纹理获取原生 GPUTexture
   * 
   * @returns GPUTexture if registered, undefined otherwise.
   */
  getTextureGPU(texture: Texture): GPUTexture | undefined;
}

/**
 * Internal Three.js backend interface (undocumented).
 * Three.js 内部后端接口（未文档化）
 */
interface ThreeBackend {
  device: GPUDevice;
  get(texture: Texture): { texture?: GPUTexture } | undefined;
}

/**
 * Centralized accessor for Three.js WebGPU backend internals.
 * Three.js WebGPU 后端内部的集中访问器
 *
 * This is the ONLY place in the codebase that accesses renderer internals.
 * 这是代码库中唯一访问 renderer 内部的地方。
 */
export const WebGpuBackend = {
  /**
   * Get backend handle from renderer.
   * 从渲染器获取后端句柄
   *
   * @returns Backend handle if WebGPU renderer, null otherwise.
   */
  from(renderer: WebGPURenderer): WebGpuBackendHandle | null {
    // Access internal backend property.
    // 访问内部后端属性
    const backend = (renderer as unknown as { backend?: ThreeBackend }).backend;
    
    if (!backend?.device) {
      console.error("[WebGpuBackend] Cannot access WebGPU backend from renderer");
      return null;
    }

    return {
      device: backend.device,
      getTextureGPU(texture: Texture): GPUTexture | undefined {
        const textureData = backend.get(texture);
        return textureData?.texture;
      },
    };
  },
};
