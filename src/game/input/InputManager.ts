// InputManager: DOM event handling, writes to RawInputState resource.
// InputManager：DOM 事件处理，写入 RawInputState 资源
//
// Industry best practice: InputManager only handles DOM events and updates raw state.
// 业界最佳实践：InputManager 只处理 DOM 事件并更新原始状态
// The actual gameplay input processing happens in inputSystem.
// 实际的游戏输入处理在 inputSystem 中进行

import { inputConfig } from "../../config/input";
import type { RawInputState } from "./RawInputState";

export class InputManager {
  private readonly domElement: HTMLElement;
  private readonly state: RawInputState;

  // Flag to disable pointer lock (e.g., in edit mode).
  // 禁用指针锁定的标志（例如在编辑模式下）
  private _pointerLockEnabled = true;

  constructor(domElement: HTMLElement, state: RawInputState) {
    this.domElement = domElement;
    this.state = state;

    domElement.addEventListener("click", this.onClick);

    document.addEventListener("pointerlockchange", this.onPointerLockChange);
    window.addEventListener("mousemove", this.onMouseMove);

    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
  }

  /**
   * Enable or disable pointer lock requests.
   * 启用或禁用指针锁定请求
   *
   * When disabled, clicks won't lock the pointer (for edit mode).
   * 禁用时，点击不会锁定指针（用于编辑模式）
   */
  setPointerLockEnabled(enabled: boolean): void {
    this._pointerLockEnabled = enabled;

    // If disabling and currently locked, exit pointer lock.
    // 如果禁用且当前已锁定，退出指针锁定
    if (!enabled && document.pointerLockElement === this.domElement) {
      document.exitPointerLock();
    }
  }

  get pointerLockEnabled(): boolean {
    return this._pointerLockEnabled;
  }

  dispose() {
    this.domElement.removeEventListener("click", this.onClick);

    document.removeEventListener("pointerlockchange", this.onPointerLockChange);
    window.removeEventListener("mousemove", this.onMouseMove);

    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);

    if (document.pointerLockElement === this.domElement) {
      document.exitPointerLock();
    }
  }

  private readonly onClick = () => {
    // Only request pointer lock if enabled.
    // 仅在启用时请求指针锁定
    if (this._pointerLockEnabled) {
      this.domElement.requestPointerLock();
    }
  };

  private readonly onPointerLockChange = () => {
    this.state.pointerLocked = document.pointerLockElement === this.domElement;
  };

  private readonly onMouseMove = (e: MouseEvent) => {
    if (!this.state.pointerLocked) return;
    this.state.mouseDeltaX += e.movementX;
    this.state.mouseDeltaY += e.movementY;
  };

  private readonly onKeyDown = (e: KeyboardEvent) => {
    if (!e.repeat) {
      this.state.keysJustPressed.add(e.code);
      if (e.code === inputConfig.toggleCameraMode.code) {
        this.state.toggleCameraModeRequested = true;
      }
      if (e.code === inputConfig.toggleThirdPersonStyle.code) {
        this.state.toggleThirdPersonStyleRequested = true;
      }
    }

    this.state.keysDown.add(e.code);
  };

  private readonly onKeyUp = (e: KeyboardEvent) => {
    this.state.keysDown.delete(e.code);
  };
}
