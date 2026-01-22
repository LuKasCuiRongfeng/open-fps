// Render configuration.
// 渲染配置

// ============================================================================
// Runtime config - can be modified at runtime via UI.
// 运行时配置 - 可通过 UI 在运行时修改
// ============================================================================
export const renderRuntimeConfig = {
  maxPixelRatio: 2.0, // cap DPR for performance / 为性能限制 DPR
  renderScale: 1.0, // 0.5-1.0, lower = better performance / 越低性能越好
};

// ============================================================================
// Static config - fixed at compile time, not exposed to UI.
// 静态配置 - 编译时固定，不暴露给 UI
// ============================================================================
export const renderStaticConfig = {
  maxDeltaSeconds: 0.05, // clamp delta to avoid huge steps after tab-switch / 限制 delta 防止切换窗口后过大
} as const;
