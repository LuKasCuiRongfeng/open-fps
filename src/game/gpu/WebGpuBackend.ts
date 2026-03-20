// WebGpuBackend: Centralized accessor for Three.js WebGPU backend internals.
// WebGpuBackend：Three.js WebGPU 后端内部的集中访问器

import type { WebGPURenderer, Texture, BufferAttribute } from "three/webgpu";

export interface WebGpuBackendHandle {
  readonly device: GPUDevice;
  getTextureGPU(texture: Texture): GPUTexture | undefined;
  getBufferGPU(attribute: BufferAttribute): GPUBuffer | undefined;
}

interface ThreeBackend {
  device: GPUDevice;
  get(resource: Texture | BufferAttribute): { texture?: GPUTexture; buffer?: GPUBuffer } | undefined;
}

export const WebGpuBackend = {
  from(renderer: WebGPURenderer): WebGpuBackendHandle | null {
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
      getBufferGPU(attribute: BufferAttribute): GPUBuffer | undefined {
        const bufferData = backend.get(attribute);
        return bufferData?.buffer;
      },
    };
  },
};