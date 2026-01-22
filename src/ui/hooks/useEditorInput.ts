// useEditorInput: Editor mouse and wheel event handling.
// useEditorInput：编辑器鼠标和滚轮事件处理

import { useEffect, useRef, type RefObject } from "react";
import type { GameApp } from "@game/GameApp";
import type { TerrainEditor } from "@game/editor";
import type { TextureEditor } from "@game/editor/texture/TextureEditor";
import type { ActiveEditorType } from "../settings/tabs/TerrainEditorTab";

interface UseEditorInputOptions {
  appRef: RefObject<GameApp | null>;
  hostRef: RefObject<HTMLDivElement | null>;
  terrainEditor: TerrainEditor | null;
  textureEditor: TextureEditor | null;
  activeEditor: ActiveEditorType;
}

interface EditorInputHandlers {
  overlayRef: RefObject<HTMLDivElement | null>;
  handleMouseDown: (e: React.MouseEvent) => void;
  handleMouseUp: (e: React.MouseEvent) => void;
}

/**
 * Hook for editor input event handling.
 * 编辑器输入事件处理的 Hook
 */
export function useEditorInput({
  appRef,
  hostRef,
  terrainEditor,
  textureEditor,
  activeEditor,
}: UseEditorInputOptions): EditorInputHandlers {
  const overlayRef = useRef<HTMLDivElement | null>(null);

  // Mouse down handler.
  // 鼠标按下处理器
  const handleMouseDown = (e: React.MouseEvent) => {
    if (!terrainEditor || activeEditor === "none") return;

    e.preventDefault();

    const action = terrainEditor.getActionForButton(e.button);
    if (action === "brush") {
      // Brush action: paint terrain or texture based on active editor.
      // 画刷操作：根据活动编辑器绘制地形或纹理
      if (activeEditor === "terrain") {
        terrainEditor.startBrush();
      } else if (activeEditor === "texture" && textureEditor?.editingEnabled) {
        textureEditor.startBrush();
      }
    } else if (action === "orbit" || action === "pan") {
      // Camera control action.
      // 相机控制操作
      terrainEditor.startCameraControl(
        e.button,
        e.clientX,
        e.clientY,
        window.innerWidth,
        window.innerHeight
      );
    }
  };

  // Mouse up handler.
  // 鼠标释放处理器
  const handleMouseUp = (e: React.MouseEvent) => {
    if (!terrainEditor) return;

    const action = terrainEditor.getActionForButton(e.button);
    if (action === "brush") {
      if (activeEditor === "terrain") {
        terrainEditor.endBrush();
      } else if (activeEditor === "texture") {
        textureEditor?.endBrush();
      }
    } else if (action === "orbit" || action === "pan") {
      terrainEditor.endCameraControl(e.button);
    }
  };

  // Global mousemove listener: allows drag to continue when mouse is over UI or outside window.
  // 全局 mousemove 监听器：允许鼠标在 UI 上或窗口外时继续拖拽
  useEffect(() => {
    if (!terrainEditor || activeEditor === "none") return;

    const handleGlobalMouseMove = (e: MouseEvent) => {
      const app = appRef.current;
      if (!app) return;

      // Update camera control (orbit/pan).
      // 更新相机控制（轨道旋转/平移）
      terrainEditor.updateCameraControl(
        e.clientX,
        e.clientY,
        window.innerWidth,
        window.innerHeight
      );

      // Update brush target position (only if not camera controlling).
      // 更新画刷目标位置（仅在不控制相机时）
      if (!terrainEditor.isCameraControlActive) {
        const rect = hostRef.current?.getBoundingClientRect();
        if (rect) {
          const mouseX = e.clientX - rect.left;
          const mouseY = e.clientY - rect.top;
          // Update brush target based on active editor.
          // 根据活动编辑器更新画刷目标
          if (activeEditor === "terrain") {
            app.updateEditorBrushTarget(mouseX, mouseY);
          } else if (activeEditor === "texture") {
            app.updateTextureBrushTarget(mouseX, mouseY);
          }
        }
      }
    };

    window.addEventListener("mousemove", handleGlobalMouseMove);
    return () => window.removeEventListener("mousemove", handleGlobalMouseMove);
  }, [terrainEditor, activeEditor, appRef, hostRef]);

  // Global mouseup listener: ensures drag ends when mouse released outside editor area.
  // Only active when stickyDrag is OFF.
  // 全局 mouseup 监听器：确保鼠标在编辑区域外释放时结束拖拽
  // 仅在 stickyDrag 关闭时激活
  useEffect(() => {
    if (!terrainEditor || activeEditor === "none" || terrainEditor.stickyDrag) return;

    const handleGlobalMouseUp = (e: MouseEvent) => {
      const action = terrainEditor.getActionForButton(e.button);
      if (action === "brush") {
        if (activeEditor === "terrain") {
          terrainEditor.endBrush();
        } else if (activeEditor === "texture") {
          textureEditor?.endBrush();
        }
      } else if (action === "orbit" || action === "pan") {
        terrainEditor.endCameraControl(e.button);
      }
    };

    window.addEventListener("mouseup", handleGlobalMouseUp);
    return () => window.removeEventListener("mouseup", handleGlobalMouseUp);
  }, [terrainEditor, textureEditor, activeEditor]);

  // Handle scroll wheel: camera zoom with Shift, brush radius without.
  // 处理滚轮：Shift+滚轮缩放相机，无Shift调整画刷半径
  useEffect(() => {
    const overlay = overlayRef.current;
    if (!overlay || !terrainEditor || activeEditor === "none") return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();

      if (e.shiftKey) {
        // Shift + wheel: adjust brush radius based on active editor.
        // Shift + 滚轮：根据活动编辑器调整画刷半径
        const delta = e.deltaY > 0 ? -2 : 2;
        if (activeEditor === "terrain") {
          const newRadius = terrainEditor.brushSettings.radiusMeters + delta;
          terrainEditor.setBrushRadius(newRadius);
        } else if (activeEditor === "texture" && textureEditor) {
          const newRadius = textureEditor.brushSettings.radius + delta;
          textureEditor.setBrushRadius(newRadius);
        }
      } else {
        // Wheel: zoom camera.
        // 滚轮：缩放相机
        terrainEditor.zoomCamera(e.deltaY);
      }
    };

    overlay.addEventListener("wheel", handleWheel, { passive: false });
    return () => overlay.removeEventListener("wheel", handleWheel);
  }, [terrainEditor, textureEditor, activeEditor]);

  return {
    overlayRef,
    handleMouseDown,
    handleMouseUp,
  };
}
