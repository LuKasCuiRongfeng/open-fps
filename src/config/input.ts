// Input configuration (keybinds).
// 输入配置（按键绑定）

export const inputConfig = {
  // Movement keys.
  // 移动键
  forward: { code: "KeyW" },
  backward: { code: "KeyS" },
  left: { code: "KeyA" },
  right: { code: "KeyD" },
  sprint: { code: "ShiftLeft" },

  // Jump.
  // 跳跃
  jump: { code: "Space" },

  // Camera mode toggles.
  // 相机模式切换
  toggleCameraMode: { code: "KeyV" },
  toggleThirdPersonStyle: { code: "KeyC" },
} as const;

export type InputConfig = typeof inputConfig;
