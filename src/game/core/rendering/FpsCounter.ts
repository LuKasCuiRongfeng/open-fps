// FpsCounter: Frame rate tracking utility.
// FpsCounter：帧率追踪工具

/**
 * Tracks frame rate based on actual render loop timing.
 * 基于实际渲染循环时间跟踪帧率
 */
export class FpsCounter {
  private frameCount = 0;
  private lastTime = 0;
  private currentFps = 0;
  private readonly updateIntervalMs: number;

  constructor(updateIntervalMs = 500) {
    this.updateIntervalMs = updateIntervalMs;
    this.lastTime = performance.now();
  }

  /**
   * Call each frame to update FPS calculation.
   * 每帧调用以更新 FPS 计算
   */
  tick(): void {
    this.frameCount++;
    const now = performance.now();
    const delta = now - this.lastTime;

    if (delta >= this.updateIntervalMs) {
      this.currentFps = Math.round((this.frameCount * 1000) / delta);
      this.frameCount = 0;
      this.lastTime = now;
    }
  }

  /**
   * Get current FPS value.
   * 获取当前 FPS 值
   */
  get fps(): number {
    return this.currentFps;
  }

  /**
   * Reset the counter.
   * 重置计数器
   */
  reset(): void {
    this.frameCount = 0;
    this.lastTime = performance.now();
    this.currentFps = 0;
  }
}
