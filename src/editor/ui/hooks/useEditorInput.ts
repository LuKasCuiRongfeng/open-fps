// useEditorInput: Editor mouse and wheel event handling.
// useEditorInput：编辑器鼠标和滚轮事件处理

import { useEffect, useRef, type RefObject } from "react";
import type { EditorAppSession } from "@editor/app";
import type { TerrainEditor } from "@editor/runtime";
import type { TextureEditor } from "@editor/runtime/texture/TextureEditor";
import type { VegetationEditor } from "@editor/runtime/vegetation/VegetationEditor";
import type { ActiveEditorType } from "../settings/tabs/TerrainEditorTab";
import type { EditorMouseAction } from "@editor/settings";

interface UseEditorInputOptions {
  appRef: RefObject<EditorAppSession | null>;
  hostRef: RefObject<HTMLDivElement | null>;
  terrainEditor: TerrainEditor | null;
  textureEditor: TextureEditor | null;
  vegetationEditor: VegetationEditor | null;
  activeEditor: ActiveEditorType;
}

interface EditorInputHandlers {
  overlayRef: RefObject<HTMLDivElement | null>;
  handleMouseDown: (e: React.MouseEvent) => void;
  handleMouseUp: (e: React.MouseEvent) => void;
}

interface ViewportPointer {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function useEditorInput({
  appRef,
  hostRef,
  terrainEditor,
  textureEditor,
  vegetationEditor,
  activeEditor,
}: UseEditorInputOptions): EditorInputHandlers {
  const overlayRef = useRef<HTMLDivElement | null>(null);

  const getEffectiveMouseAction = (button: number): EditorMouseAction | null => {
    if (activeEditor !== "none" && button === 0) {
      return "brush";
    }

    return terrainEditor?.getActionForButton(button) ?? null;
  };

  const getViewportPointer = (clientX: number, clientY: number): ViewportPointer | null => {
    const rect = hostRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0 || rect.height <= 0) return null;

    return {
      x: clientX - rect.left,
      y: clientY - rect.top,
      width: rect.width,
      height: rect.height,
    };
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
      } else if (activeEditor === "vegetation") {
        vegetationEditor?.startBrush();
      }
    } else if (action === "orbit" || action === "pan" || action === "zoom") {
      const pointer = getViewportPointer(e.clientX, e.clientY);
      const app = appRef.current;
      if (!pointer || !app) return;

      app.startEditorCameraAction(
        action,
        pointer.x,
        pointer.y,
        pointer.width,
        pointer.height,
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
      } else if (activeEditor === "vegetation") {
        vegetationEditor?.endBrush();
      }
    } else if (action === "orbit" || action === "pan" || action === "zoom") {
      const pointer = getViewportPointer(e.clientX, e.clientY);
      const app = appRef.current;
      if (pointer && app) {
        app.updateEditorCameraControl(pointer.x, pointer.y, pointer.width, pointer.height);
      }

      terrainEditor.endCameraAction(action);
    }
  };

  useEffect(() => {
    if (!terrainEditor) return;

    const handleGlobalMouseMove = (e: MouseEvent) => {
      const pointer = getViewportPointer(e.clientX, e.clientY);
      const app = appRef.current;

      if (pointer && app) {
        app.updateEditorCameraControl(pointer.x, pointer.y, pointer.width, pointer.height);
      }

      if (app && activeEditor !== "none" && !terrainEditor.isCameraControlActive) {
        if (pointer) {
          if (activeEditor === "terrain") {
            app.updateEditorBrushTarget(pointer.x, pointer.y);
          } else if (activeEditor === "texture") {
            app.updateTextureBrushTarget(pointer.x, pointer.y);
          } else if (activeEditor === "vegetation") {
            app.updateVegetationBrushTarget(pointer.x, pointer.y);
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
        } else if (activeEditor === "vegetation") {
          vegetationEditor?.endBrush();
        }
      } else if (action === "orbit" || action === "pan" || action === "zoom") {
        const pointer = getViewportPointer(e.clientX, e.clientY);
        const app = appRef.current;
        if (pointer && app) {
          app.updateEditorCameraControl(pointer.x, pointer.y, pointer.width, pointer.height);
        }

        terrainEditor.endCameraAction(action);
      }
    };

    window.addEventListener("mouseup", handleGlobalMouseUp);
    return () => window.removeEventListener("mouseup", handleGlobalMouseUp);
  }, [terrainEditor, textureEditor, vegetationEditor, activeEditor, appRef, hostRef]);

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
        } else if (activeEditor === "vegetation" && vegetationEditor) {
          const newRadius = vegetationEditor.brushSettings.radius + delta;
          vegetationEditor.setBrushRadius(newRadius);
        }
      } else {
        appRef.current?.zoomEditorCamera(e.deltaY);
      }
    };

    overlay.addEventListener("wheel", handleWheel, { passive: false });
    return () => overlay.removeEventListener("wheel", handleWheel);
  }, [terrainEditor, textureEditor, vegetationEditor, activeEditor, appRef]);

  return {
    overlayRef,
    handleMouseDown,
    handleMouseUp,
  };
}