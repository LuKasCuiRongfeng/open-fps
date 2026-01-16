// FPS Counter component with player position debug.
// FPS 计数器组件，带玩家位置调试

import { useEffect, useState } from "react";

type FpsCounterProps = {
  visible: boolean;
  getFps?: () => number;
  getPlayerPosition?: () => { x: number; y: number; z: number } | null;
};

export default function FpsCounter({ visible, getFps, getPlayerPosition }: FpsCounterProps) {
  const [fps, setFps] = useState(0);
  const [pos, setPos] = useState<{ x: number; y: number; z: number } | null>(null);

  useEffect(() => {
    if (!visible) return;

    let animationId: number;

    const update = () => {
      // Get FPS from game (actual render loop).
      // 从游戏获取 FPS（实际渲染循环）
      if (getFps) {
        setFps(getFps());
      }

      // Update position.
      // 更新位置
      if (getPlayerPosition) {
        setPos(getPlayerPosition());
      }

      animationId = requestAnimationFrame(update);
    };

    animationId = requestAnimationFrame(update);

    return () => {
      cancelAnimationFrame(animationId);
    };
  }, [visible, getFps, getPlayerPosition]);

  if (!visible) return null;

  return (
    <div className="absolute left-3 top-3 z-20 rounded bg-black/60 px-2 py-1 font-mono text-xs text-white/90 backdrop-blur-sm">
      <div>{fps} FPS</div>
      {pos && (
        <>
          <div className="text-white/70">
            X: {pos.x.toFixed(1)} Z: {pos.z.toFixed(1)}
          </div>
          <div className="text-white/70">
            海拔: {pos.y.toFixed(1)}m
          </div>
        </>
      )}
    </div>
  );
}
