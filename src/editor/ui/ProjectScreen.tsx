// ProjectScreen: pre-runtime project selection for editor mode.
// ProjectScreen：编辑器模式下的运行前项目选择界面

import { useEffect, useState } from "react";
import {
    AlertTriangle,
    Clock,
    Database,
    FolderOpen,
    Globe2,
    Loader2,
    Play,
    Trash2,
} from "lucide-react";
import { getProjectNameFromPath } from "@project/ProjectStorage";
import type { EditorWorkspaceController } from "./hooks/useEditorWorkspace";

interface Props {
    workspace: EditorWorkspaceController;
}

export function ProjectScreen({ workspace }: Props) {
    const [loading, setLoading] = useState(false);
    const [loadingPath, setLoadingPath] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [selectedPath, setSelectedPath] = useState<string | null>(
        workspace.recentProjects[0] ?? null,
    );

    useEffect(() => {
        setSelectedPath((currentPath) => {
            if (workspace.recentProjects.length === 0) {
                return null;
            }

            return currentPath && workspace.recentProjects.includes(currentPath)
                ? currentPath
                : (workspace.recentProjects[0] ?? null);
        });
    }, [workspace.recentProjects]);

    const openProject = async (projectPath: string | null) => {
        if (!projectPath) return;

        setLoading(true);
        setLoadingPath(projectPath);
        setSelectedPath(projectPath);
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
        setLoadingPath(null);
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
            setLoadingPath(null);
        }
    };

    const handleOpenSelected = () => {
        void openProject(selectedPath);
    };

    const handleRemoveRecent = async (projectPath: string) => {
        try {
            await workspace.removeRecentProjectEntry(projectPath);
        } catch (removeError) {
            console.warn("[ProjectScreen] Failed to remove recent project entry", removeError);
            setError(
                `Failed to remove recent project: ${
                    removeError instanceof Error ? removeError.message : String(removeError)
                }`,
            );
        }
    };

    const handleSkip = () => {
        workspace.enterProceduralMode();
    };

    const recentProjectCount = workspace.recentProjects.length;
    const selectedProjectName = selectedPath
        ? getProjectNameFromPath(selectedPath)
        : "No project selected";

    return (
        <div className="absolute inset-0 z-50 flex flex-col overflow-hidden bg-zinc-950 text-zinc-100">
            <header className="flex h-10 shrink-0 items-center justify-between border-b border-zinc-800 bg-zinc-900 px-3 text-xs">
                <div className="flex min-w-0 items-center gap-2 font-medium text-zinc-100">
                    <Database className="h-4 w-4 shrink-0 text-sky-400" aria-hidden="true" />
                    <span className="truncate">Open FPS Editor</span>
                </div>
                <div className="hidden min-w-0 items-center gap-2 text-zinc-500 sm:flex">
                    <span>Workspace</span>
                    <span className="text-zinc-700">/</span>
                    <span className="truncate text-zinc-300">Project Selection</span>
                </div>
                <div className="flex items-center gap-2 text-zinc-500">
                    {loading && <Loader2 className="h-3.5 w-3.5 animate-spin text-sky-400" aria-hidden="true" />}
                    <span>{loading ? "Opening" : "Ready"}</span>
                </div>
            </header>

            {error && (
                <div className="flex shrink-0 items-start gap-2 border-b border-red-500/30 bg-red-950/70 px-3 py-2 text-xs text-red-200">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-300" aria-hidden="true" />
                    <span className="min-w-0 wrap-break-word">{error}</span>
                </div>
            )}

            <main className="min-h-0 flex-1 overflow-y-auto md:overflow-hidden">
                <div className="grid min-h-full grid-cols-1 md:h-full md:grid-cols-[12rem_minmax(0,1fr)_14rem] xl:grid-cols-[14rem_minmax(0,1fr)_18rem]">
                    <aside className="border-b border-zinc-800 bg-zinc-950 p-2 md:border-b-0 md:border-r">
                        <div className="mb-2 px-2 text-xs font-medium text-zinc-500">Start</div>
                        <div className="space-y-1">
                            <button
                                type="button"
                                onClick={handleOpenProject}
                                disabled={loading}
                                className="flex h-9 w-full items-center gap-2 rounded-md border border-sky-500/40 bg-sky-500/15 px-2.5 text-left text-sm font-medium text-sky-100 transition-colors hover:border-sky-400 hover:bg-sky-500/25 disabled:cursor-not-allowed disabled:border-zinc-800 disabled:bg-zinc-900 disabled:text-zinc-500"
                            >
                                {loading && !loadingPath ? (
                                    <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden="true" />
                                ) : (
                                    <FolderOpen className="h-4 w-4 shrink-0" aria-hidden="true" />
                                )}
                                <span className="truncate">Open Project</span>
                            </button>
                            <button
                                type="button"
                                onClick={handleSkip}
                                disabled={loading}
                                className="flex h-9 w-full items-center gap-2 rounded-md border border-zinc-800 bg-zinc-900 px-2.5 text-left text-sm font-medium text-zinc-200 transition-colors hover:border-emerald-500/50 hover:bg-emerald-500/10 hover:text-emerald-100 disabled:cursor-not-allowed disabled:text-zinc-600"
                            >
                                <Globe2 className="h-4 w-4 shrink-0 text-emerald-400" aria-hidden="true" />
                                <span className="truncate">Procedural Terrain</span>
                            </button>
                        </div>

                        <div className="mt-4 border-t border-zinc-800 pt-3">
                            <div className="mb-2 px-2 text-xs font-medium text-zinc-500">Session</div>
                            <dl className="space-y-2 px-2 text-xs">
                                <div className="flex items-center justify-between gap-3">
                                    <dt className="text-zinc-500">Mode</dt>
                                    <dd className="text-zinc-300">Editor</dd>
                                </div>
                                <div className="flex items-center justify-between gap-3">
                                    <dt className="text-zinc-500">Recent</dt>
                                    <dd className="text-zinc-300">{recentProjectCount}</dd>
                                </div>
                            </dl>
                        </div>
                    </aside>

                    <section className="flex min-h-80 min-w-0 flex-col border-b border-zinc-800 bg-zinc-950 md:min-h-0 md:border-b-0">
                        <div className="flex h-10 shrink-0 items-center justify-between border-b border-zinc-800 px-3">
                            <div className="flex min-w-0 items-center gap-2">
                                <Clock className="h-4 w-4 shrink-0 text-zinc-500" aria-hidden="true" />
                                <h1 className="truncate text-sm font-semibold text-zinc-100">Recent Projects</h1>
                            </div>
                            <span className="rounded border border-zinc-800 bg-zinc-900 px-2 py-0.5 text-xs text-zinc-500">
                                {recentProjectCount} total
                            </span>
                        </div>

                        <div className="min-h-0 flex-1 overflow-y-auto p-2">
                            {recentProjectCount > 0 ? (
                                <div className="divide-y divide-zinc-800 border border-zinc-800 bg-zinc-900/40">
                                    {workspace.recentProjects.map((projectPath) => {
                                        const isSelected = selectedPath === projectPath;
                                        const isLoading = loadingPath === projectPath;
                                        const projectName = getProjectNameFromPath(projectPath);

                                        return (
                                            <div
                                                key={projectPath}
                                                className="grid grid-cols-[minmax(0,1fr)_2rem_2rem] items-center gap-1 px-1 py-1"
                                            >
                                                <button
                                                    type="button"
                                                    onClick={() => setSelectedPath(projectPath)}
                                                    onDoubleClick={() => void openProject(projectPath)}
                                                    disabled={loading}
                                                    className={`flex min-w-0 items-center gap-2 rounded px-2 py-1.5 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                                                        isSelected
                                                            ? "bg-sky-500/15 text-sky-100"
                                                            : "text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100"
                                                    }`}
                                                >
                                                    <Database
                                                        className={`h-4 w-4 shrink-0 ${isSelected ? "text-sky-300" : "text-zinc-500"}`}
                                                        aria-hidden="true"
                                                    />
                                                    <span className="min-w-0 flex-1">
                                                        <span className="block truncate text-sm font-medium">{projectName}</span>
                                                        <span className="block truncate text-xs text-zinc-500">{projectPath}</span>
                                                    </span>
                                                </button>

                                                <button
                                                    type="button"
                                                    onClick={() => void openProject(projectPath)}
                                                    disabled={loading}
                                                    className="flex h-8 w-8 items-center justify-center rounded text-zinc-500 transition-colors hover:bg-sky-500/15 hover:text-sky-200 disabled:cursor-not-allowed disabled:text-zinc-700"
                                                    title="Open project"
                                                    aria-label={`Open ${projectName}`}
                                                >
                                                    {isLoading ? (
                                                        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                                                    ) : (
                                                        <Play className="h-4 w-4" aria-hidden="true" />
                                                    )}
                                                </button>

                                                <button
                                                    type="button"
                                                    onClick={() => void handleRemoveRecent(projectPath)}
                                                    disabled={loading}
                                                    className="flex h-8 w-8 items-center justify-center rounded text-zinc-600 transition-colors hover:bg-red-500/15 hover:text-red-300 disabled:cursor-not-allowed disabled:text-zinc-800"
                                                    title="Remove from recent"
                                                    aria-label={`Remove ${projectName} from recent projects`}
                                                >
                                                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                                                </button>
                                            </div>
                                        );
                                    })}
                                </div>
                            ) : (
                                <div className="flex h-full min-h-48 flex-col items-center justify-center border border-dashed border-zinc-800 bg-zinc-900/30 px-4 py-8 text-center">
                                    <Database className="mb-2 h-7 w-7 text-zinc-600" aria-hidden="true" />
                                    <div className="text-sm font-medium text-zinc-300">No recent projects</div>
                                </div>
                            )}
                        </div>
                    </section>

                    <aside className="flex min-h-64 flex-col border-zinc-800 bg-zinc-950 p-3 md:min-h-0 md:border-l">
                        <div className="mb-3 flex items-center gap-2 text-xs font-medium text-zinc-500">
                            <Database className="h-4 w-4 shrink-0" aria-hidden="true" />
                            Selection
                        </div>

                        <div className="border border-zinc-800 bg-zinc-900/50 p-3">
                            <div className="mb-3 flex items-start gap-2">
                                <FolderOpen className="mt-0.5 h-4 w-4 shrink-0 text-sky-400" aria-hidden="true" />
                                <div className="min-w-0">
                                    <div className="truncate text-sm font-semibold text-zinc-100">{selectedProjectName}</div>
                                    <div className="mt-1 wrap-break-word text-xs leading-5 text-zinc-500">
                                        {selectedPath ?? "No selection"}
                                    </div>
                                </div>
                            </div>

                            <button
                                type="button"
                                onClick={handleOpenSelected}
                                disabled={loading || !selectedPath}
                                className="flex h-9 w-full items-center justify-center gap-2 rounded-md bg-sky-500 px-3 text-sm font-semibold text-zinc-950 transition-colors hover:bg-sky-400 disabled:cursor-not-allowed disabled:bg-zinc-800 disabled:text-zinc-500"
                            >
                                {loading && loadingPath === selectedPath ? (
                                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                                ) : (
                                    <Play className="h-4 w-4" aria-hidden="true" />
                                )}
                                Open Selected
                            </button>
                        </div>

                        <div className="mt-3 border border-zinc-800 bg-zinc-900/30 p-3 text-xs text-zinc-500">
                            <div className="mb-2 font-medium text-zinc-300">Data Project</div>
                            <div className="flex items-center justify-between gap-3 border-t border-zinc-800 py-2 first:border-t-0">
                                <span>Project file</span>
                                <span className="text-zinc-300">project.json</span>
                            </div>
                            <div className="flex items-center justify-between gap-3 border-t border-zinc-800 py-2">
                                <span>Settings file</span>
                                <span className="text-zinc-300">settings.json</span>
                            </div>
                            <div className="flex items-center justify-between gap-3 border-t border-zinc-800 pt-2">
                                <span>Maps</span>
                                <span className="text-zinc-300">maps/</span>
                            </div>
                        </div>
                    </aside>
                </div>
            </main>
        </div>
    );
}
