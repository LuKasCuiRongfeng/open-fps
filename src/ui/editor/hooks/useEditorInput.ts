// useEditorInput: Editor mouse and wheel event handling.
// useEditorInput：编辑器鼠标和滚轮事件处理

import { useEffect, useRef, type RefObject } from "react";
import type { EditorApp } from "@game/app";
import type { TerrainEditor } from "@game/editor";
import type { TextureEditor } from "@game/editor/texture/TextureEditor";
import type { ActiveEditorType } from "../settings/tabs/TerrainEditorTab";

interface UseEditorInputOptions {
  appRef: RefObject<EditorApp | null>;
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

export function useEditorInput({
  appRef,
  hostRef,
  terrainEditor,
  textureEditor,
  activeEditor,
}: UseEditorInputOptions): EditorInputHandlers {
  const overlayRef = useRef<HTMLDivElement | null>(null);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (!terrainEditor || activeEditor === "none") return;

    e.preventDefault();

    const action = terrainEditor.getActionForButton(e.button);
    if (action === "brush") {
      if (activeEditor === "terrain") {
        terrainEditor.startBrush();
      } else if (activeEditor === "texture" && textureEditor?.editingEnabled) {
        textureEditor.startBrush();
      }
    } else if (action === "orbit" || action === "pan") {
      terrainEditor.startCameraControl(
        e.button,
        e.clientX,
        e.clientY,
        window.innerWidth,
        window.innerHeight,
      );
    }
  };

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

  useEffect(() => {
    if (!terrainEditor || activeEditor === "none") return;

    const handleGlobalMouseMove = (e: MouseEvent) => {
      const app = appRef.current;
      if (!app) return;

      terrainEditor.updateCameraControl(
        e.clientX,
        e.clientY,
        window.innerWidth,
        window.innerHeight,
      );

      if (!terrainEditor.isCameraControlActive) {
        const rect = hostRef.current?.getBoundingClientRect();
        if (rect) {
          const mouseX = e.clientX - rect.left;
          const mouseY = e.clientY - rect.top;

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

  useEffect(() => {
    const overlay = overlayRef.current;
    if (!overlay || !terrainEditor || activeEditor === "none") return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();

      if (e.shiftKey) {
        const delta = e.deltaY > 0 ? -2 : 2;
        if (activeEditor === "terrain") {
          const newRadius = terrainEditor.brushSettings.radiusMeters + delta;
          terrainEditor.setBrushRadius(newRadius);
        } else if (activeEditor === "texture" && textureEditor) {
          const newRadius = textureEditor.brushSettings.radius + delta;
          textureEditor.setBrushRadius(newRadius);
        }
      } else {
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