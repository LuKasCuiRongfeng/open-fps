// FPS Counter and debug info overlay.
// FPS 计数器和调试信息叠加层

import { useEffect, useState } from "react";
import { terrainConfig } from "../config/terrain";

type DebugInfo = {
  fps: number;
  playerPos: { x: number; y: number; z: number } | null;
  mousePos: { x: number; y: number; z: number } | null;
  mouseValid: boolean;
};

type FpsCounterProps = {
  visible: boolean;
  isEditorMode: boolean;
  getFps?: () => number;
  getPlayerPosition?: () => { x: number; y: number; z: number } | null;
  getMousePosition?: () => { x: number; y: number; z: number; valid: boolean } | null;
};

export default function FpsCounter({ 
  visible, 
  isEditorMode,
  getFps, 
  getPlayerPosition,
  getMousePosition
}: FpsCounterProps) {
  const [debug, setDebug] = useState<DebugInfo>({
    fps: 0,
    playerPos: null,
    mousePos: null,
    mouseValid: false,
  });

  useEffect(() => {
    if (!visible) return;

    let animationId: number;

    const update = () => {
      const mouseInfo = getMousePosition?.();
      
      setDebug({
        fps: getFps?.() ?? 0,
        playerPos: getPlayerPosition?.() ?? null,
        mousePos: mouseInfo ? { x: mouseInfo.x, y: mouseInfo.y, z: mouseInfo.z } : null,
        mouseValid: mouseInfo?.valid ?? false,
      });

      animationId = requestAnimationFrame(update);
    };

    animationId = requestAnimationFrame(update);

    return () => {
      cancelAnimationFrame(animationId);
    };
  }, [visible, getFps, getPlayerPosition, getMousePosition]);

  if (!visible) return null;

  const { fps, playerPos, mousePos, mouseValid } = debug;
  const pageSize = terrainConfig.streaming.pageSizeMeters;

  return (
    <div className="overlay-panel absolute left-2 top-2 z-20 min-w-36 rounded-md border font-mono text-[11px] shadow-panel backdrop-blur-sm">
      <div className="flex h-6 items-center justify-between gap-3 border-b border-stroke-subtle px-2">
        <span className="text-content-muted">FPS</span>
        <span className="text-status-success">{fps}</span>
      </div>

      {/* Player info / 玩家信息 */}
      {playerPos && (
        <div className="divide-y divide-stroke-subtle px-2">
          <div className="flex min-h-5 items-center justify-between gap-3 text-content-secondary">
            <span className="text-content-muted">XZ</span>
            <span>({playerPos.x.toFixed(1)}, {playerPos.z.toFixed(1)})</span>
          </div>
          <div className="flex min-h-5 items-center justify-between gap-3 text-content-secondary">
            <span className="text-content-muted">ALT</span>
            <span>{playerPos.y.toFixed(1)}m</span>
          </div>
          <div className="flex min-h-5 items-center justify-between gap-3 text-status-info">
            <span className="text-content-muted">PAGE</span>
            <span>({Math.floor(playerPos.x / pageSize)}, {Math.floor(playerPos.z / pageSize)})</span>
          </div>
        </div>
      )}

      {/* Editor mode: mouse info / 编辑器模式：鼠标信息 */}
      {isEditorMode && mousePos && mouseValid && (
        <div className="border-t border-stroke-subtle px-2 text-status-warning">
          <div className="flex min-h-5 items-center justify-between gap-3">
            <span className="text-content-muted">MOUSE</span>
            <span>({mousePos.x.toFixed(1)}, {mousePos.y.toFixed(1)}, {mousePos.z.toFixed(1)})</span>
          </div>
          <div className="flex min-h-5 items-center justify-between gap-3">
            <span className="text-content-muted">PAGE</span>
            <span>({Math.floor(mousePos.x / pageSize)}, {Math.floor(mousePos.z / pageSize)})</span>
          </div>
        </div>
      )}
    </div>
  );
}
