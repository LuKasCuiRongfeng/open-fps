// useCloseConfirmation: Window close confirmation with unsaved changes check.
// useCloseConfirmation：带有未保存更改检查的窗口关闭确认

import { useEffect } from "react";
import { getPlatformBridge } from "@/platform";
import type { EditorApp } from "@game/app";

const platform = getPlatformBridge();

interface UseCloseConfirmationOptions {
  appRef: React.RefObject<EditorApp | null>;
  hasOpenProject: boolean;
  saveCurrentProject: (app: EditorApp) => Promise<unknown>;
}

export function useCloseConfirmation({
  appRef,
  hasOpenProject,
  saveCurrentProject,
}: UseCloseConfirmationOptions) {
  useEffect(() => {
    let unlisten: (() => void) | undefined;

    const setupCloseHandler = async () => {
      unlisten = await platform.onCloseRequested(async (event) => {
        if (!hasOpenProject) {
          return;
        }

        const terrainDirty = appRef.current?.getTerrainEditor()?.dirty ?? false;
        const textureDirty = appRef.current?.getTextureEditor()?.dirty ?? false;
        if (!terrainDirty && !textureDirty) {
          return;
        }

        event.preventDefault();

        const shouldSave = await platform.ask(
          "You have unsaved changes. Do you want to save before exiting?",
          {
            title: "Unsaved Changes",
            kind: "warning",
            okLabel: "Save & Exit",
            cancelLabel: "Exit without Saving",
          }
        );

        if (shouldSave) {
          try {
            const app = appRef.current;
            if (app) {
              await saveCurrentProject(app);
            }
          } catch (e) {
            await platform.message(
              `Save failed: ${e}\n\nPlease try again or use Save As to save to a different location.`,
              { title: "Save Error", kind: "error" }
            );
            return;
          }
        }

        await platform.closeWindow();
      });
    };

    setupCloseHandler();

    return () => {
      unlisten?.();
    };
  }, [appRef, hasOpenProject, saveCurrentProject]);
}