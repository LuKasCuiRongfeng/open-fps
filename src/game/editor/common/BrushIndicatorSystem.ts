// BrushIndicatorSystem: manages brush indicators for all editor types.
// BrushIndicatorSystem：管理所有编辑器类型的笔刷指示器

import type { Scene } from "three/webgpu";
import { BrushIndicatorMesh } from "./BrushIndicatorMesh";
import {
  BRUSH_INDICATOR_STYLES,
  type BrushIndicatorType,
} from "./BrushIndicator";

/**
 * Editor type that uses brush indicators.
 * 使用笔刷指示器的编辑器类型
 */
export type ActiveEditorType = "terrain" | "texture" | null;

/**
 * Brush info from an editor.
 * 编辑器的笔刷信息
 */
export interface EditorBrushInfo {
  targetValid: boolean;
  targetX: number;
  targetZ: number;
  radius: number;
  falloff: number;
  strength: number;
  active: boolean;
}

/**
 * BrushIndicatorSystem: manages brush indicator rendering for all editors.
 * BrushIndicatorSystem：管理所有编辑器的笔刷指示器渲染
 *
 * Only one brush indicator is visible at a time (based on active editor tab).
 * 同一时间只有一个笔刷指示器可见（根据激活的编辑器标签）
 */
export class BrushIndicatorSystem {
  private readonly indicatorMesh: BrushIndicatorMesh;
  private currentType: BrushIndicatorType = "terrain";
  private scene: Scene | null = null;
  private disposed = false;

  constructor() {
    this.indicatorMesh = new BrushIndicatorMesh(BRUSH_INDICATOR_STYLES.terrain);
    this.indicatorMesh.mesh.visible = false;
  }

  /**
   * Attach to scene.
   * 附加到场景
   */
  attach(scene: Scene): void {
    if (this.disposed) return;
    this.scene = scene;
    scene.add(this.indicatorMesh.mesh);
  }

  /**
   * Detach from scene.
   * 从场景分离
   */
  detach(): void {
    if (this.scene) {
      this.scene.remove(this.indicatorMesh.mesh);
      this.scene = null;
    }
  }

  /**
   * Set the active editor type (changes brush style).
   * 设置激活的编辑器类型（改变笔刷样式）
   */
  setActiveEditor(type: BrushIndicatorType): void {
    if (this.currentType !== type) {
      this.currentType = type;
      this.indicatorMesh.setStyle(BRUSH_INDICATOR_STYLES[type]);
    }
  }

  /**
   * Update brush indicator from editor state.
   * 从编辑器状态更新笔刷指示器
   */
  update(
    brushInfo: EditorBrushInfo | null,
    heightAt: (x: number, z: number) => number
  ): void {
    if (this.disposed) return;

    if (!brushInfo || !brushInfo.targetValid) {
      this.indicatorMesh.mesh.visible = false;
      return;
    }

    const state = {
      visible: true,
      worldX: brushInfo.targetX,
      worldZ: brushInfo.targetZ,
      radius: brushInfo.radius,
      falloff: brushInfo.falloff,
      strength: brushInfo.strength,
      active: brushInfo.active,
    };

    this.indicatorMesh.update(state, heightAt);
  }

  /**
   * Hide brush indicator.
   * 隐藏笔刷指示器
   */
  hide(): void {
    this.indicatorMesh.mesh.visible = false;
  }

  /**
   * Check if visible.
   * 检查是否可见
   */
  get visible(): boolean {
    return this.indicatorMesh.mesh.visible;
  }

  /**
   * Dispose resources.
   * 释放资源
   */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.detach();
    this.indicatorMesh.dispose();
  }
}
