// Render configuration.
// 渲染配置

export const renderConfig = {
  // Cap DPR for perf.
  // 为性能限制 DPR
  maxPixelRatio: 2.0,

  // Clamp delta time to avoid huge simulation steps after tab-switching.
  // 限制 delta time，避免切换窗口后出现过大的模拟步长
  maxDeltaSeconds: 0.05,
} as const;

export type RenderConfig = typeof renderConfig;
