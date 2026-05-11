// VegetationBrush: brush state for placing and erasing vegetation instances.
// VegetationBrush：用于摆放和擦除植被实例的画刷状态。

import type { PerspectiveCamera } from "three/webgpu";
import type { VegetationBrushMode } from "@game/world/vegetation";
import { TerrainSurfaceRaycaster } from "../common/TerrainSurfaceRaycaster";

export interface VegetationBrushSettings {
  mode: VegetationBrushMode;
  radius: number;
  densityPerSecond: number;
  scaleMin: number;
  scaleMax: number;
}

const DEFAULT_BRUSH_SETTINGS: VegetationBrushSettings = {
  mode: "place",
  radius: 6,
  densityPerSecond: 8,
  scaleMin: 0.85,
  scaleMax: 1.15,
};

export class VegetationBrush {
  private readonly _settings: VegetationBrushSettings = { ...DEFAULT_BRUSH_SETTINGS };
  private readonly terrainRaycaster = new TerrainSurfaceRaycaster();
  private _active = false;
  private _targetValid = false;
  private _targetX = 0;
  private _targetZ = 0;

  get settings(): Readonly<VegetationBrushSettings> {
    return this._settings;
  }

  get active(): boolean {
    return this._active;
  }

  get targetValid(): boolean {
    return this._targetValid;
  }

  get targetX(): number {
    return this._targetX;
  }

  get targetZ(): number {
    return this._targetZ;
  }

  setMode(mode: VegetationBrushMode): void {
    this._settings.mode = mode;
  }

  setRadius(radius: number): void {
    this._settings.radius = Math.max(0.5, Math.min(100, radius));
  }

  setDensityPerSecond(density: number): void {
    this._settings.densityPerSecond = Math.max(1, Math.min(120, density));
  }

  setScaleMin(scale: number): void {
    this._settings.scaleMin = Math.max(0.05, Math.min(this._settings.scaleMax, scale));
  }

  setScaleMax(scale: number): void {
    this._settings.scaleMax = Math.max(this._settings.scaleMin, Math.min(10, scale));
  }

  updateTarget(
    mouseX: number,
    mouseY: number,
    canvasWidth: number,
    canvasHeight: number,
    camera: PerspectiveCamera,
    heightAt: (x: number, z: number) => number,
    hasHeightAt?: (x: number, z: number) => boolean,
  ): void {
    const result = this.terrainRaycaster.cast(
      mouseX,
      mouseY,
      canvasWidth,
      canvasHeight,
      camera,
      heightAt,
      hasHeightAt,
    );

    this._targetValid = result.valid;
    if (result.valid) {
      this._targetX = result.x;
      this._targetZ = result.z;
    }
  }

  start(): void {
    if (this._targetValid) {
      this._active = true;
    }
  }

  stop(): void {
    this._active = false;
  }

  reset(): void {
    this._active = false;
    this._targetValid = false;
  }
}