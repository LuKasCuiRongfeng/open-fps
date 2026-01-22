// Default game settings factory.
// 默认游戏设置工厂

import { cameraRuntimeConfig } from "@config/camera";
import { playerRuntimeConfig } from "@config/player";
import { renderRuntimeConfig } from "@config/render";
import { skyRuntimeConfig } from "@config/sky";
import type { GameSettings } from "./types";

export function createDefaultGameSettings(): GameSettings {
  return {
    player: { ...playerRuntimeConfig },
    camera: { ...cameraRuntimeConfig },
    render: { ...renderRuntimeConfig },
    sky: { ...skyRuntimeConfig },
    editor: {
      leftButton: "brush",
      rightButton: "orbit",
      middleButton: "pan",
      stickyDrag: false,
    },
    time: {
      timeOfDay: 12, // Noon / 正午
      timeSpeed: 60, // 1 game minute per real second / 每真实秒1游戏分钟
      timePaused: false,
      timeDrivenSun: true,
    },
  };
}
