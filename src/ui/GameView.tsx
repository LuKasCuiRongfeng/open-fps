import { useEffect, useRef, useState } from "react";
import { worldConfig } from "../config/world";
import { GameApp } from "../game/GameApp";

function keyLabelFromCode(code: string) {
  if (code.startsWith("Key") && code.length === 4) return code.slice(3);
  if (code.startsWith("Digit") && code.length === 6) return code.slice(5);
  return code;
}

export default function GameView() {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    let app: GameApp | undefined;

    try {
      app = new GameApp(host);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }

    return () => {
      app?.dispose();
    };
  }, []);

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-black text-white">
      <div ref={hostRef} className="h-full w-full" />

      <div className="pointer-events-none absolute bottom-3 left-3 select-none text-xs opacity-70">
        <div>
          Click to lock pointer · WASD move · Shift sprint · {keyLabelFromCode(
            worldConfig.input.toggleCameraMode.code,
          )} toggle 1st/3rd · {keyLabelFromCode(worldConfig.input.toggleThirdPersonStyle.code)} toggle OTS/Chase
        </div>
      </div>

      {error ? (
        <div className="absolute inset-0 flex items-center justify-center p-6">
          <div className="max-w-xl rounded bg-black/70 p-4 text-sm leading-relaxed">
            <div className="mb-2 font-semibold">WebGPU init failed</div>
            <div className="opacity-90">{error}</div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
