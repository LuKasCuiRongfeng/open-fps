// Vegetation rendering configuration.
// 植被渲染配置。

export const vegetationRenderConfig = {
  game: {
    // EN: Keep distant trees on their last LOD until terrain streaming, not the model's authoring distance, removes them.
    // 中文: 让远处树木保持最后一级 LOD，直到地形流式加载边界移除它们，而不是被模型编辑距离过早裁掉。
    maxVisibleDistanceScale: 2,
    shadowsEnabled: true,
  },
  editor: {
    // EN: Orbit editing views maps from higher and farther angles, so the editor needs a wider vegetation preview.
    // 中文: 轨道编辑会从更高更远角度查看地图，因此编辑器需要更宽的植被预览范围。
    maxVisibleDistanceScale: 5,
    shadowsEnabled: false,
  },
} as const;