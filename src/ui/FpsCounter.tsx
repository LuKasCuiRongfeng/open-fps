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
  const chunkSize = terrainConfig.streaming.chunkSizeMeters;

  return (
    <div className="overlay-panel absolute left-3 top-3 z-20 rounded-md border px-2 py-1 font-mono text-xs shadow-panel backdrop-blur-sm">
      {/* FPS */}
      <div className="text-status-success">{fps} FPS</div>
      
      {/* Player info / 玩家信息 */}
      {playerPos && (
        <>
          <div className="mt-1 text-content-secondary">
            Player XZ: ({playerPos.x.toFixed(1)}, {playerPos.z.toFixed(1)})
          </div>
          <div className="text-content-secondary">
            Altitude: {playerPos.y.toFixed(1)}m
          </div>
          <div className="text-status-info">
            Chunk: ({Math.floor(playerPos.x / chunkSize)}, {Math.floor(playerPos.z / chunkSize)})
          </div>
        </>
      )}

      {/* Editor mode: mouse info / 编辑器模式：鼠标信息 */}
      {isEditorMode && mousePos && mouseValid && (
        <>
          <div className="mt-2 text-status-warning">
            Mouse: ({mousePos.x.toFixed(1)}, {mousePos.y.toFixed(1)}, {mousePos.z.toFixed(1)})
          </div>
          <div className="text-status-warning">
            Chunk: ({Math.floor(mousePos.x / chunkSize)}, {Math.floor(mousePos.z / chunkSize)})
          </div>
        </>
      )}
    </div>
  );
}
