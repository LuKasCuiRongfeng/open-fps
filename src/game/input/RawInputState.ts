// RawInputState: pure data representing raw input state each frame.
// RawInputState：纯数据，表示每帧的原始输入状态
//
// Industry best practice: separate input data from DOM event handling.
// 业界最佳实践：将输入数据与 DOM 事件处理分离
// This enables: replay systems, AI control, network sync, testing.
// 这样可以实现：回放系统、AI 控制、网络同步、测试

/**
 * Raw input state - updated by InputManager, read by inputSystem.
 * 原始输入状态 - 由 InputManager 更新，由 inputSystem 读取
 *
 * This is a resource (not a component) because there's only one input source.
 * 这是资源（不是组件），因为只有一个输入源
 */
export type RawInputState = {
  // Pointer lock state.
  // 指针锁定状态
  pointerLocked: boolean;

  // Keys currently held down (by KeyboardEvent.code).
  // 当前按下的键（按 KeyboardEvent.code）
  keysDown: Set<string>;

  // Keys just pressed this frame (consumed after read).
  // 本帧刚按下的键（读取后清除）
  keysJustPressed: Set<string>;

  // Mouse movement delta since last frame.
  // 自上一帧以来的鼠标移动增量
  mouseDeltaX: number;
  mouseDeltaY: number;

  // Toggle requests (consumed after read).
  // 切换请求（读取后清除）
  toggleCameraModeRequested: boolean;
  toggleThirdPersonStyleRequested: boolean;
};

/**
 * Create initial raw input state.
 * 创建初始原始输入状态
 */
export function createRawInputState(): RawInputState {
  return {
    pointerLocked: false,
    keysDown: new Set(),
    keysJustPressed: new Set(),
    mouseDeltaX: 0,
    mouseDeltaY: 0,
    toggleCameraModeRequested: false,
    toggleThirdPersonStyleRequested: false,
  };
}

/**
 * Clear per-frame input state (call after inputSystem has processed).
 * 清除每帧输入状态（在 inputSystem 处理后调用）
 */
export function clearFrameInputState(state: RawInputState): void {
  state.keysJustPressed.clear();
  state.mouseDeltaX = 0;
  state.mouseDeltaY = 0;
  state.toggleCameraModeRequested = false;
  state.toggleThirdPersonStyleRequested = false;
}
