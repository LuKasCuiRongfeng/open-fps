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
        <div className="app-root absolute inset-0 z-50 flex flex-col overflow-hidden">
            <header className="shell-surface flex h-10 shrink-0 items-center justify-between border-b border-stroke-subtle px-3 text-xs">
                <div className="flex min-w-0 items-center gap-2 font-medium text-content-primary">
                    <Database className="h-4 w-4 shrink-0 text-accent-primary" aria-hidden="true" />
                    <span className="truncate">Open FPS Editor</span>
                </div>
                <div className="hidden min-w-0 items-center gap-2 text-content-muted sm:flex">
                    <span>Workspace</span>
                    <span className="text-content-disabled">/</span>
                    <span className="truncate text-content-secondary">Project Selection</span>
                </div>
                <div className="flex items-center gap-2 text-content-muted">
                    {loading && <Loader2 className="h-3.5 w-3.5 animate-spin text-accent-primary" aria-hidden="true" />}
                    <span>{loading ? "Opening" : "Ready"}</span>
                </div>
            </header>

            {error && (
                <div className="flex shrink-0 items-start gap-2 border-b border-status-danger/35 bg-status-danger/15 px-3 py-2 text-xs text-status-danger">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                    <span className="min-w-0 wrap-break-word">{error}</span>
                </div>
            )}

            <main className="min-h-0 flex-1 overflow-y-auto md:overflow-hidden">
                <div className="grid min-h-full grid-cols-1 md:h-full md:grid-cols-[12rem_minmax(0,1fr)_14rem] xl:grid-cols-[14rem_minmax(0,1fr)_18rem]">
                    <aside className="shell-surface border-b border-stroke-subtle p-2 md:border-b-0 md:border-r">
                        <div className="mb-2 px-2 text-xs font-medium text-content-muted">Start</div>
                        <div className="space-y-1">
                            <button
                                type="button"
                                onClick={handleOpenProject}
                                disabled={loading}
                                className="flex h-9 w-full items-center gap-2 rounded-md border border-accent-primary/45 bg-accent-primary/15 px-2.5 text-left text-sm font-medium text-content-primary transition-colors hover:border-accent-primary hover:bg-accent-primary/25 disabled:cursor-not-allowed disabled:border-stroke-subtle disabled:bg-surface-control disabled:text-content-disabled"
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
                                className="flex h-9 w-full items-center gap-2 rounded-md border border-stroke-subtle bg-surface-control px-2.5 text-left text-sm font-medium text-content-secondary transition-colors hover:border-status-success/50 hover:bg-status-success/10 hover:text-content-primary disabled:cursor-not-allowed disabled:text-content-disabled"
                            >
                                <Globe2 className="h-4 w-4 shrink-0 text-status-success" aria-hidden="true" />
                                <span className="truncate">Procedural Terrain</span>
                            </button>
                        </div>

                        <div className="mt-4 border-t border-stroke-subtle pt-3">
                            <div className="mb-2 px-2 text-xs font-medium text-content-muted">Session</div>
                            <dl className="space-y-2 px-2 text-xs">
                                <div className="flex items-center justify-between gap-3">
                                    <dt className="text-content-muted">Mode</dt>
                                    <dd className="text-content-secondary">Editor</dd>
                                </div>
                                <div className="flex items-center justify-between gap-3">
                                    <dt className="text-content-muted">Recent</dt>
                                    <dd className="text-content-secondary">{recentProjectCount}</dd>
                                </div>
                            </dl>
                        </div>
                    </aside>

                    <section className="app-root flex min-h-80 min-w-0 flex-col border-b border-stroke-subtle md:min-h-0 md:border-b-0">
                        <div className="flex h-10 shrink-0 items-center justify-between border-b border-stroke-subtle px-3">
                            <div className="flex min-w-0 items-center gap-2">
                                <Clock className="h-4 w-4 shrink-0 text-content-muted" aria-hidden="true" />
                                <h1 className="truncate text-sm font-semibold text-content-primary">Recent Projects</h1>
                            </div>
                            <span className="rounded border border-stroke-subtle bg-surface-control px-2 py-0.5 text-xs text-content-muted">
                                {recentProjectCount} total
                            </span>
                        </div>

                        <div className="min-h-0 flex-1 overflow-y-auto p-2">
                            {recentProjectCount > 0 ? (
                                <div className="divide-y divide-stroke-subtle border border-stroke-subtle bg-surface-panel/70">
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
                                                            ? "bg-accent-primary/15 text-content-primary"
                                                            : "text-content-secondary hover:bg-surface-control-hover hover:text-content-primary"
                                                    }`}
                                                >
                                                    <Database
                                                        className={`h-4 w-4 shrink-0 ${isSelected ? "text-accent-primary" : "text-content-muted"}`}
                                                        aria-hidden="true"
                                                    />
                                                    <span className="min-w-0 flex-1">
                                                        <span className="block truncate text-sm font-medium">{projectName}</span>
                                                        <span className="block truncate text-xs text-content-muted">{projectPath}</span>
                                                    </span>
                                                </button>

                                                <button
                                                    type="button"
                                                    onClick={() => void openProject(projectPath)}
                                                    disabled={loading}
                                                    className="flex h-8 w-8 items-center justify-center rounded text-content-muted transition-colors hover:bg-accent-primary/15 hover:text-accent-primary disabled:cursor-not-allowed disabled:text-content-disabled"
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
                                                    className="flex h-8 w-8 items-center justify-center rounded text-content-disabled transition-colors hover:bg-status-danger/15 hover:text-status-danger disabled:cursor-not-allowed disabled:text-content-disabled"
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
                                <div className="flex h-full min-h-48 flex-col items-center justify-center border border-dashed border-stroke-subtle bg-surface-panel/60 px-4 py-8 text-center">
                                    <Database className="mb-2 h-7 w-7 text-content-disabled" aria-hidden="true" />
                                    <div className="text-sm font-medium text-content-secondary">No recent projects</div>
                                </div>
                            )}
                        </div>
                    </section>

                    <aside className="shell-surface flex min-h-64 flex-col border-stroke-subtle p-3 md:min-h-0 md:border-l">
                        <div className="mb-3 flex items-center gap-2 text-xs font-medium text-content-muted">
                            <Database className="h-4 w-4 shrink-0" aria-hidden="true" />
                            Selection
                        </div>

                        <div className="panel-surface border p-3">
                            <div className="mb-3 flex items-start gap-2">
                                <FolderOpen className="mt-0.5 h-4 w-4 shrink-0 text-accent-primary" aria-hidden="true" />
                                <div className="min-w-0">
                                    <div className="truncate text-sm font-semibold text-content-primary">{selectedProjectName}</div>
                                    <div className="mt-1 wrap-break-word text-xs leading-5 text-content-muted">
                                        {selectedPath ?? "No selection"}
                                    </div>
                                </div>
                            </div>

                            <button
                                type="button"
                                onClick={handleOpenSelected}
                                disabled={loading || !selectedPath}
                                className="flex h-9 w-full items-center justify-center gap-2 rounded-md bg-accent-primary px-3 text-sm font-semibold text-accent-primary-content transition-colors hover:bg-accent-primary-hover disabled:cursor-not-allowed disabled:bg-surface-panel-strong disabled:text-content-disabled"
                            >
                                {loading && loadingPath === selectedPath ? (
                                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                                ) : (
                                    <Play className="h-4 w-4" aria-hidden="true" />
                                )}
                                Open Selected
                            </button>
                        </div>

                        <div className="panel-muted-surface mt-3 border p-3 text-xs text-content-muted">
                            <div className="mb-2 font-medium text-content-secondary">Data Project</div>
                            <div className="flex items-center justify-between gap-3 border-t border-stroke-subtle py-2 first:border-t-0">
                                <span>Project file</span>
                                <span className="text-content-secondary">project.json</span>
                            </div>
                            <div className="flex items-center justify-between gap-3 border-t border-stroke-subtle py-2">
                                <span>Settings file</span>
                                <span className="text-content-secondary">settings.json</span>
                            </div>
                            <div className="flex items-center justify-between gap-3 border-t border-stroke-subtle pt-2">
                                <span>Maps</span>
                                <span className="text-content-secondary">maps/</span>
                            </div>
                        </div>
                    </aside>
                </div>
            </main>
        </div>
    );
}
