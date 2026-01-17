// ProjectScreen: Pre-game screen to open project or skip to procedural terrain.
// ProjectScreen：游戏前打开项目或跳过到程序生成地形的界面

import { useState, useCallback } from "react";
import { 
  openProjectDialog, 
  loadProject,
  setCurrentProjectPath,
} from "../game/editor/ProjectStorage";
import type { MapData } from "../game/editor/MapData";
import type { GameSettings } from "../game/settings/GameSettings";

interface Props {
  onComplete: (mapData: MapData | null, projectPath: string | null, settings: GameSettings | null) => void;
}

/**
 * Project screen shown before game starts.
 * 游戏开始前显示的项目界面
 *
 * User can:
 * - Open an existing project folder
 * - Skip to use procedural terrain (no editing, no project)
 *
 * 用户可以：
 * - 打开现有项目文件夹
 * - 跳过，使用程序生成的地形（不可编辑，无项目）
 */
export function MapImportScreen({ onComplete }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Handle open project via folder dialog.
  // 通过文件夹对话框处理打开项目
  const handleOpenProject = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const projectPath = await openProjectDialog();
      if (projectPath) {
        const { map, settings } = await loadProject(projectPath);
        onComplete(map, projectPath, settings);
      } else {
        // User cancelled dialog.
        // 用户取消对话框
        setLoading(false);
      }
    } catch (e) {
      setError(`Failed to open project: ${e}`);
      setLoading(false);
    }
  }, [onComplete]);

  // Skip, use procedural terrain (no project).
  // 跳过，使用程序生成的地形（无项目）
  const handleSkip = useCallback(() => {
    setCurrentProjectPath(null);
    onComplete(null, null, null);
  }, [onComplete]);

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-linear-to-b from-slate-900 to-slate-800">
      <div className="w-full max-w-md rounded-xl bg-black/60 p-8 backdrop-blur-md">
        {/* Title / 标题 */}
        <h1 className="mb-2 text-center text-3xl font-bold text-white">
          Open FPS
        </h1>
        <p className="mb-8 text-center text-sm text-gray-400">
          Terrain Editor & Game
        </p>

        {/* Description */}
        <p className="mb-6 text-center text-sm text-gray-300">
          Open a project folder to edit terrain, or skip to explore procedural terrain.
        </p>

        {error && (
          <div className="mb-4 rounded-lg bg-red-900/30 p-3 text-sm text-red-300">
            {error}
          </div>
        )}

        {/* Actions / 操作 */}
        <div className="flex flex-col gap-3">
          <button
            onClick={handleOpenProject}
            disabled={loading}
            className="w-full rounded-lg bg-blue-600 py-3 font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-700 disabled:text-gray-500"
          >
            {loading ? "Loading..." : "Open Project..."}
          </button>

          <button
            onClick={handleSkip}
            disabled={loading}
            className="w-full rounded-lg bg-gray-700 py-3 font-medium text-white transition-colors hover:bg-gray-600 disabled:cursor-not-allowed disabled:text-gray-500"
          >
            Skip (Explore Only)
          </button>
        </div>

        {/* Info */}
        <div className="mt-6 rounded-lg bg-blue-900/30 p-3 text-xs text-blue-200">
          <strong>Note:</strong> If you skip, terrain will be procedurally generated
          and cannot be edited. You can save the procedural terrain as a new project
          from Settings to enable editing.
        </div>
      </div>
    </div>
  );
}
