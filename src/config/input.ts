// Input configuration (keybinds).
// 输入配置（按键绑定）

export const inputConfig = {
  // Movement keys (with alternative bindings).
  // 移动键（含备用绑定）
  forward: { codes: ["KeyW", "ArrowUp"] },
  backward: { codes: ["KeyS", "ArrowDown"] },
  left: { codes: ["KeyA", "ArrowLeft"] },
  right: { codes: ["KeyD", "ArrowRight"] },
  sprint: { codes: ["ShiftLeft", "ShiftRight"] },

  // Jump.
  // 跳跃
  jump: { codes: ["Space"] },

  // Camera mode toggles.
  // 相机模式切换
  toggleCameraMode: { codes: ["KeyV"] },
  toggleThirdPersonStyle: { codes: ["KeyC"] },
} as const;

export type InputConfig = typeof inputConfig;

/** Check if any of the codes in a binding are pressed. / 检查绑定中的任意键码是否被按下 */
export const isKeyDown = (keysDown: Set<string>, binding: { codes: readonly string[] }): boolean =>
  binding.codes.some(c => keysDown.has(c));

/** Check if any of the codes in a binding were just pressed. / 检查绑定中的任意键码是否刚被按下 */
export const isKeyJustPressed = (keysPressed: Set<string>, binding: { codes: readonly string[] }): boolean =>
  binding.codes.some(c => keysPressed.has(c));
