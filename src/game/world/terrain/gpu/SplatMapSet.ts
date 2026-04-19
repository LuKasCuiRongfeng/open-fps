import type { DataTexture, WebGPURenderer } from "three/webgpu";
import { MAX_SPLAT_MAPS, LAYERS_PER_SPLAT_MAP } from "../../../editor/texture/TextureData";
import { SplatMapCompute, type SplatBrushStroke } from "./SplatMapCompute";

export class SplatMapSet {
  private readonly splatMaps: SplatMapCompute[] = [];
  private readonly resolution: number;
  private readonly worldSize: number;
  private splatMapCount = 1;

  constructor(resolution: number = 1024, worldSize: number = 1024) {
    this.resolution = resolution;
    this.worldSize = worldSize;
  }

  async init(renderer: WebGPURenderer, count: number = 1): Promise<void> {
    this.splatMapCount = Math.max(1, Math.min(count, MAX_SPLAT_MAPS));
    this.dispose();

    for (let i = 0; i < this.splatMapCount; i++) {
      const splatMap = new SplatMapCompute(this.resolution, this.worldSize);
      await splatMap.init(renderer, i);
      this.splatMaps.push(splatMap);
    }
  }

  async resize(renderer: WebGPURenderer, newCount: number): Promise<void> {
    const targetCount = Math.max(1, Math.min(newCount, MAX_SPLAT_MAPS));

    if (targetCount === this.splatMapCount) return;

    if (targetCount > this.splatMapCount) {
      for (let i = this.splatMapCount; i < targetCount; i++) {
        const splatMap = new SplatMapCompute(this.resolution, this.worldSize);
        await splatMap.init(renderer, i);
        if (this.splatMaps[0]) {
          splatMap.setWorldOffset(
            (this.splatMaps[0] as unknown as { worldOffsetX: { value: number } }).worldOffsetX?.value ?? 0,
            (this.splatMaps[0] as unknown as { worldOffsetZ: { value: number } }).worldOffsetZ?.value ?? 0,
          );
        }
        this.splatMaps.push(splatMap);
      }
    } else {
      while (this.splatMaps.length > targetCount) {
        const removed = this.splatMaps.pop();
        removed?.dispose();
      }
    }

    this.splatMapCount = targetCount;
  }

  async applyBrush(renderer: WebGPURenderer, stroke: SplatBrushStroke): Promise<void> {
    const splatMapIndex = Math.floor(stroke.targetLayer / LAYERS_PER_SPLAT_MAP);
    const channel = stroke.targetLayer % LAYERS_PER_SPLAT_MAP;

    if (splatMapIndex >= this.splatMaps.length) {
      console.warn(`[SplatMapSet] Layer ${stroke.targetLayer} exceeds available splat maps`);
      return;
    }

    const internalStroke: SplatBrushStroke = {
      ...stroke,
      targetLayer: channel,
    };

    await this.splatMaps[splatMapIndex].applyBrush(renderer, internalStroke);
  }

  getSplatTexture(index: number = 0): DataTexture | null {
    return this.splatMaps[index]?.getSplatTexture() ?? null;
  }

  getAllSplatTextures(): (DataTexture | null)[] {
    return this.splatMaps.map((splatMap) => splatMap.getSplatTexture());
  }

  getCount(): number {
    return this.splatMapCount;
  }

  setWorldOffset(offsetX: number, offsetZ: number): void {
    for (const splatMap of this.splatMaps) {
      splatMap.setWorldOffset(offsetX, offsetZ);
    }
  }

  getResolution(): number {
    return this.resolution;
  }

  getWorldSize(): number {
    return this.worldSize;
  }

  async loadFromPixels(
    renderer: WebGPURenderer,
    pixels: Uint8Array,
    sourceResolution: number = this.resolution,
    splatMapIndex: number = 0,
  ): Promise<void> {
    if (splatMapIndex >= this.splatMaps.length) {
      console.warn(`[SplatMapSet] Index ${splatMapIndex} out of range`);
      return;
    }

    await this.splatMaps[splatMapIndex].loadFromPixels(renderer, pixels, sourceResolution);
  }

  async readToPixels(renderer: WebGPURenderer, splatMapIndex: number = 0): Promise<Uint8Array> {
    if (splatMapIndex >= this.splatMaps.length) {
      throw new Error(`[SplatMapSet] Index ${splatMapIndex} out of range`);
    }

    return this.splatMaps[splatMapIndex].readToPixels(renderer);
  }

  syncReadableTextures(renderer: WebGPURenderer): void {
    for (const splatMap of this.splatMaps) {
      splatMap.syncReadableTexture(renderer);
    }
  }

  dispose(): void {
    for (const splatMap of this.splatMaps) {
      splatMap.dispose();
    }

    this.splatMaps.length = 0;
  }
}