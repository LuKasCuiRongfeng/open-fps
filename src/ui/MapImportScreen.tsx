// ProjectScreen: Pre-game screen to open project or skip to procedural terrain.
// ProjectScreen：游戏前打开项目或跳过到程序生成地形的界面

import { useState, useEffect } from "react";
import {
  openProjectDialog,
  loadProject,
  setCurrentProjectPath,
  listRecentProjects,
  removeRecentProject,
  getProjectNameFromPath,
} from "@project/ProjectStorage";
import type { MapData } from "@project/MapData";
import type { GameSettings } from "@game/settings/GameSettings";

interface Props {
  onComplete: (
    mapData: MapData | null,
    projectPath: string | null,
    settings: GameSettings | null
  ) => void;
}

/**
 * Project screen shown before game starts.
 * 游戏开始前显示的项目界面
 */
export function MapImportScreen({ onComplete }: Props) {
  const [loading, setLoading] = useState(false);
  const [loadingPath, setLoadingPath] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [recentProjects, setRecentProjects] = useState<string[]>([]);

  // Load recent projects on mount.
  // 挂载时加载最近项目
  useEffect(() => {
    listRecentProjects()
      .then(setRecentProjects)
      .catch(() => setRecentProjects([]));
  }, []);

  // Open project from path (recent or dialog).
  // 从路径打开项目（最近或对话框）
  const openProject = async (projectPath: string | null) => {
    if (!projectPath) return;

    setLoading(true);
    setLoadingPath(projectPath);
    setError(null);

    try {
      const { map, settings } = await loadProject(projectPath);
      onComplete(map, projectPath, settings);
    } catch (e) {
      setError(`Failed to open project: ${e}`);
      setLoading(false);
      setLoadingPath(null);
    }
  };

  // Handle open project via folder dialog.
  // 通过文件夹对话框处理打开项目
  const handleOpenProject = async () => {
    setLoading(true);
    setError(null);

    try {
      const projectPath = await openProjectDialog();
      if (projectPath) {
        await openProject(projectPath);
      } else {
        setLoading(false);
      }
    } catch (e) {
      setError(`Failed to open project: ${e}`);
      setLoading(false);
    }
  };

  // Handle remove from recent.
  // 处理从最近项目中移除
  const handleRemoveRecent = async (e: React.MouseEvent, path: string) => {
    e.stopPropagation();
    try {
      await removeRecentProject(path);
      setRecentProjects((prev) => prev.filter((p) => p !== path));
    } catch {
      // Ignore errors.
      // 忽略错误
    }
  };

  // Skip, use procedural terrain (no project).
  // 跳过，使用程序生成的地形（无项目）
  const handleSkip = () => {
    setCurrentProjectPath(null);
    onComplete(null, null, null);
  };

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center overflow-hidden bg-linear-to-br from-slate-900 via-slate-800 to-slate-900 p-4">
      {/* Background decoration / 背景装饰 */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-32 -top-32 h-96 w-96 rounded-full bg-blue-500/10 blur-3xl" />
        <div className="absolute -bottom-32 -right-32 h-96 w-96 rounded-full bg-purple-500/10 blur-3xl" />
        <div className="absolute left-1/2 top-1/2 h-64 w-64 -translate-x-1/2 -translate-y-1/2 rounded-full bg-cyan-500/5 blur-3xl" />
      </div>

      {/* Main card / 主卡片 */}
      <div className="relative flex max-h-full w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-white/10 bg-black/40 p-8 shadow-2xl backdrop-blur-xl">
        {/* Logo / 徽标 */}
        <div className="mb-6 flex shrink-0 flex-col items-center">
          <div className="mb-3 flex h-16 w-16 items-center justify-center rounded-2xl bg-linear-to-br from-blue-500 to-purple-600 text-3xl shadow-lg">
            🎮
          </div>
          <h1 className="bg-linear-to-r from-white to-gray-300 bg-clip-text text-3xl font-bold text-transparent">
            Open FPS
          </h1>
          <p className="mt-1 text-sm text-gray-400">
            Terrain Editor & Game Engine
          </p>
        </div>

        {/* Error message / 错误消息 */}
        {error && (
          <div className="mb-4 shrink-0 rounded-lg border border-red-500/30 bg-red-900/20 p-3 text-sm text-red-300">
            <span className="mr-2">⚠️</span>
            {error}
          </div>
        )}

        {/* Recent Projects / 最近项目 */}
        {recentProjects.length > 0 && (
          <div className="mb-5 flex min-h-0 shrink flex-col">
            <h2 className="mb-3 flex shrink-0 items-center gap-2 text-sm font-medium text-gray-300">
              <span className="text-base">📂</span>
              Recent Projects
            </h2>
            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto rounded-lg border border-white/5 bg-black/20 p-2">
              {recentProjects.map((path) => (
                <div
                  key={path}
                  onClick={() => !loading && openProject(path)}
                  className={`group flex w-full cursor-pointer items-center gap-3 rounded-lg border border-transparent bg-white/5 p-3 text-left transition-all hover:border-blue-500/30 hover:bg-white/10 ${loading ? "cursor-not-allowed opacity-50" : ""}`}
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-linear-to-br from-blue-500/20 to-purple-500/20 text-lg">
                    📁
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium text-white">
                      {getProjectNameFromPath(path)}
                    </div>
                    <div className="truncate text-xs text-gray-500">{path}</div>
                  </div>
                  {loadingPath === path ? (
                    <div className="h-5 w-5 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
                  ) : (
                    <button
                      onClick={(e) => handleRemoveRecent(e, path)}
                      className="shrink-0 rounded p-1 text-gray-500 opacity-0 transition-opacity hover:bg-white/10 hover:text-red-400 group-hover:opacity-100"
                      title="Remove from recent"
                    >
                      ✕
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Actions / 操作 */}
        <div className="shrink-0 space-y-3">
          <button
            onClick={handleOpenProject}
            disabled={loading}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-linear-to-r from-blue-600 to-blue-500 py-3.5 font-medium text-white shadow-lg shadow-blue-500/25 transition-all hover:from-blue-500 hover:to-blue-400 hover:shadow-blue-500/40 disabled:cursor-not-allowed disabled:from-gray-700 disabled:to-gray-600 disabled:text-gray-400 disabled:shadow-none"
          >
            {loading && !loadingPath ? (
              <>
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                Loading...
              </>
            ) : (
              <>
                <span className="text-lg">📂</span>
                Open Project...
              </>
            )}
          </button>

          <div className="flex items-center gap-3">
            <div className="h-px flex-1 bg-linear-to-r from-transparent via-white/20 to-transparent" />
            <span className="text-xs text-gray-500">or</span>
            <div className="h-px flex-1 bg-linear-to-r from-transparent via-white/20 to-transparent" />
          </div>

          <button
            onClick={handleSkip}
            disabled={loading}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 py-3.5 font-medium text-gray-300 transition-all hover:border-white/20 hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:text-gray-600"
          >
            <span className="text-lg">🌍</span>
            Explore Procedural Terrain
          </button>
        </div>

        {/* Info note / 提示说明 */}
        <div className="mt-4 shrink-0 rounded-lg border border-blue-500/20 bg-blue-500/5 p-3 text-xs text-blue-200/80">
          <div className="mb-1 flex items-center gap-1.5 font-medium text-blue-300">
            <span>💡</span>
            Tip
          </div>
          Choose "Explore" to generate infinite procedural terrain. You can save
          it as a project later from Settings to enable editing.
        </div>

        {/* Version / 版本 */}
        <div className="mt-3 shrink-0 text-center text-xs text-gray-600">v0.1.0</div>
      </div>
    </div>
  );
}
