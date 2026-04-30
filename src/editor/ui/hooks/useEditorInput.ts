// useEditorInput: Editor mouse and wheel event handling.
// useEditorInput：编辑器鼠标和滚轮事件处理

import { useEffect, useRef, type RefObject } from "react";
import type { EditorAppSession } from "@editor/app";
import type { TerrainEditor } from "@editor/runtime";
import type { TextureEditor } from "@editor/runtime/texture/TextureEditor";
import type { ActiveEditorType } from "../settings/tabs/TerrainEditorTab";
import type { EditorMouseAction } from "@editor/settings";

interface UseEditorInputOptions {
  appRef: RefObject<EditorAppSession | null>;
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

  const getEffectiveMouseAction = (button: number): EditorMouseAction | null => {
    if (activeEditor === "none" && button === 0) {
      return "pan";
    }

    return terrainEditor?.getActionForButton(button) ?? null;
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (!terrainEditor) return;

    const action = getEffectiveMouseAction(e.button);
    if (!action) return;

    e.preventDefault();

    if (action === "brush") {
      if (activeEditor === "terrain") {
        terrainEditor.startBrush();
      } else if (activeEditor === "texture" && textureEditor?.editingEnabled) {
        textureEditor.startBrush();
      }
    } else if (action === "orbit" || action === "pan") {
      terrainEditor.startCameraAction(
        action,
        e.clientX,
        e.clientY,
        window.innerWidth,
        window.innerHeight,
      );
    }
  };

  const handleMouseUp = (e: React.MouseEvent) => {
    if (!terrainEditor) return;

    const action = getEffectiveMouseAction(e.button);
    if (action === "brush") {
      if (activeEditor === "terrain") {
        terrainEditor.endBrush();
      } else if (activeEditor === "texture") {
        textureEditor?.endBrush();
      }
    } else if (action === "orbit" || action === "pan") {
      terrainEditor.endCameraAction(action);
    }
  };

  useEffect(() => {
    if (!terrainEditor) return;

    const handleGlobalMouseMove = (e: MouseEvent) => {
      terrainEditor.updateCameraControl(
        e.clientX,
        e.clientY,
        window.innerWidth,
        window.innerHeight,
      );

      const app = appRef.current;
      if (app && activeEditor !== "none" && !terrainEditor.isCameraControlActive) {
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
    if (!terrainEditor || terrainEditor.stickyDrag) return;

    const handleGlobalMouseUp = (e: MouseEvent) => {
      const action = getEffectiveMouseAction(e.button);
      if (action === "brush") {
        if (activeEditor === "terrain") {
          terrainEditor.endBrush();
        } else if (activeEditor === "texture") {
          textureEditor?.endBrush();
        }
      } else if (action === "orbit" || action === "pan") {
        terrainEditor.endCameraAction(action);
      }
    };

    window.addEventListener("mouseup", handleGlobalMouseUp);
    return () => window.removeEventListener("mouseup", handleGlobalMouseUp);
  }, [terrainEditor, textureEditor, activeEditor]);

  useEffect(() => {
    const overlay = overlayRef.current;
    if (!overlay || !terrainEditor) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();

      if (e.shiftKey && activeEditor !== "none") {
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