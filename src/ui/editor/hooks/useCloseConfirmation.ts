// useCloseConfirmation: Window close confirmation with unsaved changes check.
// useCloseConfirmation：带有未保存更改检查的窗口关闭确认

import { useEffect } from "react";
import { getPlatform } from "@/platform";
import type { EditorAppSession } from "@editor/app";

const platform = getPlatform();

interface UseCloseConfirmationOptions {
  appRef: React.RefObject<EditorAppSession | null>;
  hasOpenProject: boolean;
  saveCurrentProject: (app: EditorAppSession) => Promise<unknown>;
}

export function useCloseConfirmation({
  appRef,
  hasOpenProject,
  saveCurrentProject,
}: UseCloseConfirmationOptions) {
  useEffect(() => {
    let unlisten: (() => void) | undefined;

    const setupCloseHandler = async () => {
      unlisten = await platform.window.onCloseRequested(async (event) => {
        if (!hasOpenProject) {
          return;
        }

        const terrainDirty = appRef.current?.getTerrainEditor()?.dirty ?? false;
        const textureDirty = appRef.current?.getTextureEditor()?.dirty ?? false;
        if (!terrainDirty && !textureDirty) {
          return;
        }

        event.preventDefault();

        const shouldSave = await platform.dialogs.confirm(
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
            await platform.dialogs.notify(
              `Save failed: ${e}\n\nPlease try again or use Save As to save to a different location.`,
              { title: "Save Error", kind: "error" }
            );
            return;
          }
        }

        await platform.window.close();
      });
    };

    setupCloseHandler();

    return () => {
      unlisten?.();
    };
  }, [appRef, hasOpenProject, saveCurrentProject]);
}