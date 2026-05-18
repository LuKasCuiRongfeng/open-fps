# AI 开发指南

这是 `.github/copilot-instructions.md` 的项目级补充说明。

## 规则

- 保持本文档简洁。只添加长期有效的项目规则，并优先使用短条目而不是长解释。
- 开发过程中出现新的长期项目规则时，主动补充到这里。
- 涉及地图、资产、编辑器、运行时、生成脚本或开放世界内容生产的工作，必须对齐根目录 `OPEN_WORLD_ROADMAP.md`，并在路线变化时同步更新该文档。
- `OPEN_WORLD_ROADMAP.md` 是当前最佳路线判断，不是僵化计划；发现更优业界方案时必须主动提出、说明取舍，并在采纳后更新路线图。
- 项目文档一律使用中文，包括 README、架构说明、迁移说明、工作流文档，以及纯文档用途的 Markdown 内容。
- 项目优先追求正确、先进且可维护的最优解，并优先采用业界最佳方案；当旧实现落后、存在缺陷或阻碍更优方案时，AI 不应为兼容旧写法而妥协，可以直接重构，或在需要用户权衡时主动推荐更优方案供用户选择。
- 当前处于地图设计彻底重构阶段，`main` 地图目标是接近《荒野大镖客2》式小型开放世界体验；现有已刷纹理、植被和相关内容均视为临时测试数据，必要时可以删除、重建或替换，不应为保留测试数据牺牲架构与质量。
- 项目没有专职美术支持；新增模型、贴图、材质、HDRI、音效等内容资产时，AI 必须主动使用公开且授权清晰的资源，优先选择 CC0 或允许商用与再分发的公开资源，例如 Poly Haven（https://polyhaven.com/），并在资产元数据、文档或提交说明中保留来源与授权信息。
- 需要美术资产时，AI 应直接搜索、筛选、下载并接入合适的公开资源；不要因为缺少本地资产就退回简单 cube、sphere、cylinder、plane 等基础几何体作为最终内容。
- 严禁把简单几何图形当作最终美术占位提交到地图、运行时、cooked 资产或用户可见玩法内容中；简单几何只允许用于编辑器 gizmo、brush indicator、collision/nav/debug overlay、临时诊断或用户明确要求的短期调试，并且不得伪装成最终美术方案。
- `kunlun_wilds` 是正式默认资产项目，显示名为 `Kunlun Wilds`，以中国神话中的昆仑意象命名；开发默认资产、地图 source/cooked 数据和 bundled game data 时都应优先使用该项目。
- `kunlun_wilds/assets` 必须保持项目级资产库结构：`registry.json` 记录资产用途、来源、授权和导入产物；`sources/` 保存外部公开资源元数据；`imported/` 保存生成脚本和运行时可引用的导入产物。不要恢复 `assets/model`、`assets/texture` 或未注册裸文件目录。
- 地图 source manifest、植被模型、材质层、world object archetype 和 cooked package 只能引用已登记在 `assets/registry.json` 的 imported 资产；新增公开资产时必须同时补 registry、source metadata、导入产物和验证。
- 当旧代码或功能设计存在实质性缺陷时，AI 代理可以重新设计并重构，只要这样能提升正确性、可维护性或工作流边界；不要仅因为旧设计已存在就保留它。
- AI 主导的重新设计应保持聚焦：说明设计变更，保留预期的用户可见行为，并验证受影响的工作流。
- 所有项目 UI 都应保持紧凑、严肃的编辑器式桌面应用审美；避免网页式或卡片网格式呈现模式。
- 平台特定行为应封装在 `src/platform/` 能力层之后；应用代码不得直接调用原生命令名。
- 可编辑地形高度存储为 `terrain/height/manifest.json` + `terrain/height/regions/*.heightpack` 的 v1 region pack；manifest 使用 region key 到 64 位十六进制稀疏 mask 的紧凑索引，`map.json` 只保留 `terrainPath`，不要添加旧高度页格式或冗长 page 表兼容性。
- 默认地图必须保留 `generation/graph.json` world generation graph source sidecar；地形、材质、植被、对象、collision 和 nav 的生成规则、依赖和重建粒度应优先登记在 graph 中，并纳入 cooked source hash。
- 涉及地图局部重建、过期 cook、collision/nav 派生或发布包索引时，应优先使用 `scripts/map-generation/world-rebuild-planner.mjs` 解析 stage closure 与 region/cell scope；不要在单个脚本里硬编码另一套重建依赖。
- 可编辑纹理绘制存储为 `paint/layers.json` + `paint/regions/*.paintpack` 的 v2 region pack；manifest 使用 region key 到 64 位十六进制稀疏 mask 的紧凑索引，不要恢复整张 `paint/pages/splat_*.paint.rgba` 存储。
- 可编辑植被实例存储为 `vegetation/models.json` + `vegetation/regions/*.vegpack` 的 v5 region pack；manifest 使用 region key 到 64 位十六进制稀疏 mask 的紧凑索引，变长 cell 实例计数保存在 pack 头中，不要恢复逐 cell 文件存储。
- 地形、纹理和植被生成脚本应保持独立：`gen:terrain` 只重建地形高度和地图清单，`gen:paint` 只重建纹理绘制资源，`gen:vegetation` 只重建植被资源；只有显式使用 `gen:all` 时才重建全部地图生成资源。
- 项目持久化写入必须使用具备临时文件与备份恢复能力的安全写入路径；不要直接向最终的 `project.json`、`settings.json`、`map.json`、`.heightpack`、`.paintpack`、`.vegpack` 或 PNG 资产目标路径写入会截断文件的裸 I/O。
- 基于 region pack 的 sidecar 资产提交必须先写完整二进制 pack，再写 JSON manifest，最后清理旧 pack；不要在 manifest 更新前删除旧 pack。
- 非文档类项目文本的新增或修改内容使用英文：UI 文案、测试名、日志、错误、配置描述、fixture 文本、文件名和资产元数据。
- 除非本地化工作要求修改，否则保留现有非英文文本不变。
- 使用清晰的英文代码标识符。
- 除非用户明确要求构建桌面平台，否则不要主动运行 Tauri/桌面完整构建；需要桌面侧轻量验证时只运行 `cargo check`。
- 新增或修改的代码注释应同时使用英文和中文。
- 当意图、约束、风险或不变量不明显时，应为重要代码添加注释。这包括算法、渲染或 GPU 决策、持久化、迁移、平台桥接、调度、安全敏感路径和领域规则。
- 不要添加只是复述明显语法的注释。

## 注释格式

```ts
// EN: Keep the terrain seed stable so saved maps reproduce the same height field.
// 中文: 保持地形种子稳定，确保已保存地图能复现相同高度场。
const terrainSeed = project.map.seed;
```

## 自检

完成前自检：AI所做的修改是否符合项目要求。

