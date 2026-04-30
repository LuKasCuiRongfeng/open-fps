// ProjectScreen: pre-runtime project selection for editor mode.
// ProjectScreen：编辑器模式下的运行前项目选择界面

import { useEffect, useState } from "react";
import {
    AlertTriangle,
    Database,
    FolderOpen,
    Globe2,
    Loader2,
    Play,
    Trash2,
} from "lucide-react";
import { getProjectNameFromPath } from "@project/ProjectStorage";
import { Badge } from "@ui/components/ui/badge";
import { Button } from "@ui/components/ui/button";
import type { EditorWorkspaceController } from "./hooks/useEditorWorkspace";

interface Props {
    workspace: EditorWorkspaceController;
}

type InspectorRowProps = {
    label: string;
    value: string;
};

function InspectorRow({ label, value }: InspectorRowProps) {
    return (
        <div className="flex min-h-7 items-center justify-between gap-3 border-t border-stroke-subtle px-2 text-xs first:border-t-0">
            <span className="shrink-0 text-content-muted">{label}</span>
            <span className="min-w-0 truncate text-right font-mono text-content-secondary" title={value}>{value}</span>
        </div>
    );
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
        } catch (error) {
            setError(`Failed to open project: ${error}`);
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
        } catch (error) {
            setError(`Failed to open project: ${error}`);
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
            <header className="shell-surface flex h-9 shrink-0 items-center justify-between border-b border-stroke-subtle px-3 text-xs">
                <div className="flex min-w-0 items-center gap-2 font-semibold text-content-primary">
                    <Database className="h-4 w-4 shrink-0 text-accent-primary" aria-hidden="true" />
                    <span className="truncate">Open FPS Editor</span>
                </div>
                <div className="hidden min-w-0 items-center gap-2 text-content-muted sm:flex">
                    <span>Workspace</span>
                    <span className="text-content-disabled">/</span>
                    <span className="truncate text-content-secondary">Project Selection</span>
                </div>
                <Badge variant={loading ? "primary" : "default"}>{loading ? "Opening" : "Ready"}</Badge>
            </header>

            {error && (
                <div className="flex shrink-0 items-start gap-2 border-b border-status-danger/35 bg-status-danger/15 px-3 py-2 text-xs text-status-danger">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                    <span className="min-w-0 wrap-break-word">{error}</span>
                </div>
            )}

            <main className="flex min-h-0 flex-1 flex-col md:flex-row">
                <aside className="shell-surface flex w-full shrink-0 flex-col border-b border-stroke-subtle md:w-44 md:border-b-0 md:border-r">
                    <section className="border-b border-stroke-subtle p-2">
                        <div className="mb-1 px-1 text-[11px] font-semibold uppercase tracking-wide text-content-muted">Start</div>
                        <div className="space-y-1">
                            <Button
                                type="button"
                                onClick={handleOpenProject}
                                disabled={loading}
                                variant="primary"
                                className="w-full justify-start"
                            >
                                {loading && !loadingPath ? (
                                    <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" aria-hidden="true" />
                                ) : (
                                    <FolderOpen className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                                )}
                                Open Project
                            </Button>
                            <Button
                                type="button"
                                onClick={handleSkip}
                                disabled={loading}
                                className="w-full justify-start"
                            >
                                <Globe2 className="h-3.5 w-3.5 shrink-0 text-status-success" aria-hidden="true" />
                                Procedural Terrain
                            </Button>
                        </div>
                    </section>

                    <section className="p-2">
                        <div className="mb-1 px-1 text-[11px] font-semibold uppercase tracking-wide text-content-muted">Session</div>
                        <InspectorRow label="Mode" value="Editor" />
                        <InspectorRow label="Recent" value={String(recentProjectCount)} />
                    </section>
                </aside>

                <section className="flex min-w-0 flex-1 flex-col">
                    <div className="flex h-9 shrink-0 items-center justify-between border-b border-stroke-subtle px-3">
                        <div className="flex min-w-0 items-center gap-2">
                            <Database className="h-4 w-4 shrink-0 text-content-muted" aria-hidden="true" />
                            <h1 className="truncate text-xs font-semibold text-content-primary">Recent Projects</h1>
                        </div>
                        <Badge>{recentProjectCount} total</Badge>
                    </div>

                    <div className="min-h-0 flex-1 overflow-auto">
                        {recentProjectCount > 0 ? (
                            <div className="min-w-2xl">
                                <div className="flex h-7 items-center border-b border-stroke-subtle bg-surface-panel-muted px-2 text-[11px] font-semibold uppercase tracking-wide text-content-muted">
                                    <div className="min-w-0 flex-1">Project</div>
                                    <div className="w-18 shrink-0 text-right">Actions</div>
                                </div>
                                {workspace.recentProjects.map((projectPath) => {
                                    const isSelected = selectedPath === projectPath;
                                    const isLoading = loadingPath === projectPath;
                                    const projectName = getProjectNameFromPath(projectPath);

                                    return (
                                        <div
                                            key={projectPath}
                                            className={`flex min-h-9 items-center border-b border-stroke-subtle px-1.5 text-xs ${
                                                isSelected ? "bg-accent-primary/12 text-content-primary" : "text-content-secondary"
                                            }`}
                                        >
                                            <button
                                                type="button"
                                                onClick={() => setSelectedPath(projectPath)}
                                                onDoubleClick={() => void openProject(projectPath)}
                                                disabled={loading}
                                                className="flex min-w-0 flex-1 items-center gap-2 rounded px-1.5 py-1.5 text-left transition-colors hover:bg-surface-control-hover disabled:cursor-not-allowed disabled:opacity-60"
                                            >
                                                <Database
                                                    className={`h-3.5 w-3.5 shrink-0 ${isSelected ? "text-accent-primary" : "text-content-muted"}`}
                                                    aria-hidden="true"
                                                />
                                                <span className="min-w-0 flex-1">
                                                    <span className="block truncate font-medium">{projectName}</span>
                                                    <span className="block truncate font-mono text-[11px] text-content-muted">{projectPath}</span>
                                                </span>
                                            </button>

                                            <div className="flex w-18 shrink-0 justify-end gap-1">
                                                <button
                                                    type="button"
                                                    onClick={() => void openProject(projectPath)}
                                                    disabled={loading}
                                                    className="flex h-7 w-7 items-center justify-center rounded text-content-muted transition-colors hover:bg-accent-primary/15 hover:text-accent-primary disabled:cursor-not-allowed disabled:text-content-disabled"
                                                    title="Open project"
                                                    aria-label={`Open ${projectName}`}
                                                >
                                                    {isLoading ? (
                                                        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                                                    ) : (
                                                        <Play className="h-3.5 w-3.5" aria-hidden="true" />
                                                    )}
                                                </button>

                                                <button
                                                    type="button"
                                                    onClick={() => void handleRemoveRecent(projectPath)}
                                                    disabled={loading}
                                                    className="flex h-7 w-7 items-center justify-center rounded text-content-disabled transition-colors hover:bg-status-danger/15 hover:text-status-danger disabled:cursor-not-allowed disabled:text-content-disabled"
                                                    title="Remove from recent"
                                                    aria-label={`Remove ${projectName} from recent projects`}
                                                >
                                                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        ) : (
                            <div className="border-b border-stroke-subtle px-3 py-2 text-xs text-content-muted">
                                No recent projects. Open a project folder or enter procedural terrain mode.
                            </div>
                        )}
                    </div>
                </section>

                <aside className="shell-surface flex w-full shrink-0 flex-col border-t border-stroke-subtle md:w-72 md:border-l md:border-t-0">
                    <header className="flex h-9 shrink-0 items-center gap-2 border-b border-stroke-subtle px-3 text-xs font-semibold text-content-secondary">
                        <FolderOpen className="h-4 w-4 shrink-0 text-accent-primary" aria-hidden="true" />
                        Selection
                    </header>

                    <div className="min-h-0 flex-1 overflow-auto">
                        <section className="border-b border-stroke-subtle p-2">
                            <div className="mb-2 min-w-0">
                                <div className="truncate text-xs font-semibold text-content-primary">{selectedProjectName}</div>
                                <div className="mt-1 wrap-break-word font-mono text-[11px] leading-4 text-content-muted">
                                    {selectedPath ?? "No selection"}
                                </div>
                            </div>
                            <Button
                                type="button"
                                onClick={handleOpenSelected}
                                disabled={loading || !selectedPath}
                                variant="primary"
                                className="w-full"
                            >
                                {loading && loadingPath === selectedPath ? (
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                                ) : (
                                    <Play className="h-3.5 w-3.5" aria-hidden="true" />
                                )}
                                Open Selected
                            </Button>
                        </section>

                        <section className="p-2">
                            <div className="mb-1 px-1 text-[11px] font-semibold uppercase tracking-wide text-content-muted">Data Project</div>
                            <InspectorRow label="Project" value="project.json" />
                            <InspectorRow label="Settings" value="settings.json" />
                            <InspectorRow label="Maps" value="maps/" />
                        </section>
                    </div>
                </aside>
            </main>
        </div>
    );
}