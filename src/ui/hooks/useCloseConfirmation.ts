// useCloseConfirmation: Window close confirmation with unsaved changes check.
// useCloseConfirmation：带有未保存更改检查的窗口关闭确认

import { useEffect } from "react";
import type { GameApp } from "@game/GameApp";
import { hasOpenProject, saveProjectMap } from "@project/ProjectStorage";

/**
 * Hook to handle window close confirmation when there are unsaved changes.
 * 处理有未保存更改时的窗口关闭确认的 Hook
 */
export function useCloseConfirmation(appRef: React.RefObject<GameApp | null>) {
  useEffect(() => {
    let unlisten: (() => void) | undefined;

    const setupCloseHandler = async () => {
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      const win = getCurrentWindow();

      unlisten = await win.onCloseRequested(async (event) => {
        // Only check for unsaved changes if a project is open.
        // 只有在打开项目时才检查未保存的更改
        if (!hasOpenProject()) {
          // No project open (procedural mode), allow close without prompt.
          // 未打开项目（程序生成模式），直接关闭无需提示
          return;
        }

        // Check if there are unsaved changes (terrain or texture).
        // 检查是否有未保存的更改（地形或纹理）
        const terrainDirty = appRef.current?.getTerrainEditor()?.dirty ?? false;
        const textureDirty = appRef.current?.getTextureEditor()?.dirty ?? false;
        if (!terrainDirty && !textureDirty) {
          // No unsaved changes, allow close.
          // 没有未保存的更改，允许关闭
          return;
        }

        // Prevent window from closing immediately.
        // 阻止窗口立即关闭
        event.preventDefault();

        // Show save confirmation dialog.
        // 显示保存确认对话框
        const { ask, message } = await import("@tauri-apps/plugin-dialog");
        const shouldSave = await ask(
          "You have unsaved changes. Do you want to save before exiting?",
          {
            title: "Unsaved Changes",
            kind: "warning",
            okLabel: "Save & Exit",
            cancelLabel: "Exit without Saving",
          }
        );

        if (shouldSave) {
          // Save to current project (no rename).
          // 保存到当前项目（不重命名）
          try {
            const app = appRef.current;
            if (app) {
              const mapData = app.exportCurrentMapData();
              const settings = app.getSettingsSnapshot();
              const savedPath = await saveProjectMap(mapData, settings);

              // Save texture data if texture editing is enabled.
              // 如果启用了纹理编辑，保存纹理数据
              if (app.getTextureEditor().editingEnabled && savedPath) {
                await app.saveTexturesToProject(savedPath);
              }
            }
          } catch (e) {
            // Save failed, show error and abort close.
            // 保存失败，显示错误并取消关闭
            await message(
              `Save failed: ${e}\n\nPlease try again or use Save As to save to a different location.`,
              { title: "Save Error", kind: "error" }
            );
            // Don't close the window, let user retry.
            // 不关闭窗口，让用户重试
            return;
          }
        }

        // Close the window.
        // 关闭窗口
        await win.destroy();
      });
    };

    setupCloseHandler();

    return () => {
      unlisten?.();
    };
  }, [appRef]);
}
