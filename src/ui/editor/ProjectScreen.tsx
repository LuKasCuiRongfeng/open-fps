// ProjectScreen: pre-runtime project selection for editor mode.
// ProjectScreen：编辑器模式下的运行前项目选择界面

import { useState } from "react";
import { getProjectNameFromPath } from "@project/ProjectStorage";
import type { EditorWorkspaceController } from "./hooks/useEditorWorkspace";

interface Props {
  workspace: EditorWorkspaceController;
}

export function ProjectScreen({ workspace }: Props) {
  const [loading, setLoading] = useState(false);
  const [loadingPath, setLoadingPath] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const openProject = async (projectPath: string | null) => {
    if (!projectPath) return;

    setLoading(true);
    setLoadingPath(projectPath);
    setError(null);

    try {
      const project = await workspace.openProjectRecord(projectPath);
      workspace.completeProjectSelection(project);
    } catch (e) {
      setError(`Failed to open project: ${e}`);
      setLoading(false);
      setLoadingPath(null);
    }
  };

  const handleOpenProject = async () => {
    setLoading(true);
    setError(null);

    try {
      const project = await workspace.openProjectFromDialog();
      if (project) {
        workspace.completeProjectSelection(project);
      } else {
        setLoading(false);
      }
    } catch (e) {
      setError(`Failed to open project: ${e}`);
      setLoading(false);
    }
  };

  const handleRemoveRecent = async (e: React.MouseEvent, path: string) => {
    e.stopPropagation();
    try {
      await workspace.removeRecentProjectEntry(path);
    } catch {
      // Ignore errors.
    }
  };

  const handleSkip = () => {
    workspace.enterProceduralMode();
  };

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center overflow-hidden bg-linear-to-br from-slate-900 via-slate-800 to-slate-900 p-4">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-32 -top-32 h-96 w-96 rounded-full bg-blue-500/10 blur-3xl" />
        <div className="absolute -bottom-32 -right-32 h-96 w-96 rounded-full bg-purple-500/10 blur-3xl" />
        <div className="absolute left-1/2 top-1/2 h-64 w-64 -translate-x-1/2 -translate-y-1/2 rounded-full bg-cyan-500/5 blur-3xl" />
      </div>

      <div className="relative flex max-h-full w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-white/10 bg-black/40 p-8 shadow-2xl backdrop-blur-xl">
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

        {error && (
          <div className="mb-4 shrink-0 rounded-lg border border-red-500/30 bg-red-900/20 p-3 text-sm text-red-300">
            <span className="mr-2">⚠️</span>
            {error}
          </div>
        )}

        {workspace.recentProjects.length > 0 && (
          <div className="mb-5 flex min-h-0 shrink flex-col">
            <h2 className="mb-3 flex shrink-0 items-center gap-2 text-sm font-medium text-gray-300">
              <span className="text-base">📂</span>
              Recent Projects
            </h2>
            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto rounded-lg border border-white/5 bg-black/20 p-2">
              {workspace.recentProjects.map((path) => (
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

        <div className="mt-4 shrink-0 rounded-lg border border-blue-500/20 bg-blue-500/5 p-3 text-xs text-blue-200/80">
          <div className="mb-1 flex items-center gap-1.5 font-medium text-blue-300">
            <span>💡</span>
            Tip
          </div>
          Choose "Explore" to generate infinite procedural terrain. You can save
          it as a project later from Settings to enable editing.
        </div>

        <div className="mt-3 shrink-0 text-center text-xs text-gray-600">v0.1.0</div>
      </div>
    </div>
  );
}