// FPS Counter component.
// FPS 计数器组件

import { useEffect, useState } from "react";

type FpsCounterProps = {
  visible: boolean;
};

export default function FpsCounter({ visible }: FpsCounterProps) {
  const [fps, setFps] = useState(0);

  useEffect(() => {
    if (!visible) return;

    let frameCount = 0;
    let lastTime = performance.now();
    let animationId: number;

    const update = () => {
      frameCount++;
      const now = performance.now();
      const delta = now - lastTime;

      // Update FPS every 500ms for stability.
      // 每 500ms 更新一次 FPS 以保持稳定
      if (delta >= 500) {
        setFps(Math.round((frameCount * 1000) / delta));
        frameCount = 0;
        lastTime = now;
      }

      animationId = requestAnimationFrame(update);
    };

    animationId = requestAnimationFrame(update);

    return () => {
      cancelAnimationFrame(animationId);
    };
  }, [visible]);

  if (!visible) return null;

  return (
    <div className="absolute left-3 top-3 z-20 rounded bg-black/60 px-2 py-1 font-mono text-xs text-white/90 backdrop-blur-sm">
      {fps} FPS
    </div>
  );
}
