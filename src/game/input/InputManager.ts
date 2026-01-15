import { worldConfig } from "../../config/world";

export class InputManager {
  private readonly domElement: HTMLElement;

  private readonly pressed = new Set<string>();
  private readonly justPressed = new Set<string>();
  private pointerLocked = false;

  private mouseDeltaX = 0;
  private mouseDeltaY = 0;

  private toggleCameraModeRequested = false;
  private toggleThirdPersonStyleRequested = false;

  constructor(domElement: HTMLElement) {
    this.domElement = domElement;

    domElement.addEventListener("click", this.onClick);

    document.addEventListener("pointerlockchange", this.onPointerLockChange);
    window.addEventListener("mousemove", this.onMouseMove);

    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
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

  get isPointerLocked() {
    return this.pointerLocked;
  }

  isDown(code: string) {
    return this.pressed.has(code);
  }

  consumeJustPressed(code: string) {
    const has = this.justPressed.has(code);
    if (has) this.justPressed.delete(code);
    return has;
  }

  consumeMouseDelta() {
    const dx = this.mouseDeltaX;
    const dy = this.mouseDeltaY;
    this.mouseDeltaX = 0;
    this.mouseDeltaY = 0;
    return { dx, dy };
  }

  consumeToggleCameraMode() {
    const v = this.toggleCameraModeRequested;
    this.toggleCameraModeRequested = false;
    return v;
  }

  consumeToggleThirdPersonStyle() {
    const v = this.toggleThirdPersonStyleRequested;
    this.toggleThirdPersonStyleRequested = false;
    return v;
  }

  private readonly onClick = () => {
    this.domElement.requestPointerLock();
  };

  private readonly onPointerLockChange = () => {
    this.pointerLocked = document.pointerLockElement === this.domElement;
  };

  private readonly onMouseMove = (e: MouseEvent) => {
    if (!this.pointerLocked) return;
    this.mouseDeltaX += e.movementX;
    this.mouseDeltaY += e.movementY;
  };

  private readonly onKeyDown = (e: KeyboardEvent) => {
    if (!e.repeat) {
      this.justPressed.add(e.code);
      if (e.code === worldConfig.input.toggleCameraMode.code) {
        this.toggleCameraModeRequested = true;
      }
      if (e.code === worldConfig.input.toggleThirdPersonStyle.code) {
        this.toggleThirdPersonStyleRequested = true;
      }
    }

    this.pressed.add(e.code);
  };

  private readonly onKeyUp = (e: KeyboardEvent) => {
    this.pressed.delete(e.code);
  };
}
