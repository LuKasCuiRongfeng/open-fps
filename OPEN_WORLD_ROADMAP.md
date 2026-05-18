# Open FPS 开放世界路线图

本文档是项目向“10 平方公里小型开放世界地图，质量目标对标《荒野大镖客2》式业界最佳实践”前进的长期开发指引。它代表当前基于项目状态、目标约束和业界最佳实践做出的最佳路线判断，不是一次性计划，也不是不可改变的教条。

## 使用方式

- 开始地图、资产、编辑器、运行时或工具链相关开发前，先检查本路线图是否仍然匹配当前目标。
- 每完成一个重要能力，更新对应状态、下一步或验收标准，避免路线遗忘和实现漂移。
- 如果开发过程中发现更优的业界方案、技术路径或架构取舍，必须主动提出并更新本文档；不要因为旧路线已经写下就一条路走到底。
- 当短期需求与路线冲突时，优先选择能提升长期正确性、可维护性、性能边界和内容质量的方案。
- 不为保留临时测试数据牺牲架构质量；`main` 地图现有内容仍可按需要重建。

## 动态路线原则

- 路线图是当前最佳判断，不是冻结的规格书。
- 当行业实践、项目约束、性能瓶颈或内容目标发生变化时，应重新评估路线。
- 更优方案出现时，至少要说明：为什么更优、替换哪些旧假设、迁移成本和风险是什么。
- 如果暂时不立即采用更优方案，也要把原因记录清楚，避免未来误以为旧方案仍然是最佳路线。
- 严禁为了“保持计划一致”而继续推进已经明显落后的实现方式。

## 北极星目标

目标不是简单做一张大地图，而是建立一套能稳定生产高质量开放世界的工程管线：

- 地图规模：`main` 目标约 10 平方公里，用于小型但高密度的开放世界开发样板。
- 扩展策略：地图尺寸必须优先按 page/cell 整数栅格扩展；从约 10 平方公里扩展到约 20 平方公里时，优先考虑 `4480m x 4480m`（70 个 64m page，约 20.07 平方公里）这类整页尺寸，而不是任意小数面积。
- 内容气质：强调自然地貌、道路、水体、生态、地标、兴趣点和可玩路径的融合。
- 技术底座：WebGPU-first，资产 region/cell 化，编辑格式与运行格式分层，支持流式加载、增量保存、自动校验和性能预算。
- 工作方式：先做正确资产和世界分区管线，再逐步堆内容密度和视觉表现。

## 当前阶段

项目已经完成了从原型 JSON/散文件向专业 sidecar 资产体系的关键转向。默认资产项目已正式命名为 `Kunlun Wilds`，目录为 `kunlun_wilds`；该名称取自中国神话中的昆仑意象，作为开放世界默认 source/cooked 资产项目继续演进。

- `map.json` 保持为地图级 manifest，地形、纹理、植被和世界对象数据移出主清单。
- `generation/graph.json` 已作为 `main` 的 world generation graph v1 source sidecar，声明 terrain、paint、vegetation、objects、collision、nav 的生成阶段、共享依赖、可执行 executor、局部重建粒度、invalidation 和预算入口。
- 地形高度使用 `terrain/height/manifest.json` + `.heightpack` region pack。
- 纹理绘制使用 `paint/layers.json` + `.paintpack` region pack。
- 植被实例使用 `vegetation/models.json` + `.vegpack` region pack。
- 世界对象使用 `objects/manifest.json` + `.objectpack` partition cell pack，首批道路、水体、POI 和道具已由 `OPEN_WORLD_DESIGN_SPEC.md` 规则生成，并已有 archetype render/editor/scatter/validation 元数据。
- `kunlun_wilds/assets` 已从裸文件目录升级为项目级资产库：`registry.json` 统一登记资产用途、授权、来源和导入产物，`sources/` 保留 Poly Haven/CC0 来源元数据，`imported/` 存放生成脚本和运行时可引用的模型与材质。
- 已有 dirty region/page 保存、编辑器 undo/redo 和安全写入；terrain、paint、vegetation、world object 的 sidecar 保存均向 manifest-last 提交协议收敛。
- terrain、paint、vegetation、objects manifest 已记录 region/cell pack 的 byte length 与 SHA-256，并在加载、保存、生成和资产校验中统一验证。
- 已有 `main` 地图资产验证脚本，可检查 manifest、region pack、孤儿文件、截断文件和内容 hash。
- 地图资产验证已覆盖资产注册表、来源元数据、导入产物覆盖率、旧 `assets/model`/`assets/texture` 目录禁用、source manifest 注册引用和 cooked `assetRegistry` source hash。
- 已有 cooked map manifest v4：记录 source hash、build input signature、content-addressed package artifact index、terrain/paint/vegetation/object asset index，以及 8-page world partition cell dependency 表。
- web game bundled runtime 已优先读取 cooked manifest，并从 cooked asset index 派生 terrain、paint、vegetation 运行时 manifest。
- cooked 输出已复制运行时所需的 region pack、terrain texture、vegetation model 和 world object GLTF 资产，game target 不再依赖 source sidecar 目录读取核心运行资产。
- cooked 输出现在按 `cooked/assets/imported/...` 保留注册表导入路径结构，避免运行时重新依赖 source 资产库，同时保留 source path 和 content hash 可追溯性。
- cooked 输出已写入 `cooked/cache/maps/<mapId>.json`，用于记录 build input signature、artifact 列表和 stale cook 诊断依据。
- cooked package 已生成 `content-addressed-sha256-v1` artifact index，并把 runtime artifact 同步写入 `cooked/blobs/sha256/...`；package manifest 已记录 streaming locality、去重策略和压缩策略入口。
- world partition cell 已收敛到 `dependencies` 结构，统一挂载 terrain、paint、vegetation、objects、collision、nav 六类运行时分区依赖。
- objects cooked cell pack 现在来自 source object pack，不再是空生成物；collision cell pack 由 terrain heightfield、水体 volume 和对象 blocker 派生；nav cell pack 由 terrain slope、道路、水体和碰撞 blocker 派生。
- runtime world partition planner 已接入 game streaming hot path，可按玩家/摄像机位置生成 load/keep/unload cell、预取 object/collision/nav cell pack、缓存已加载 payload，并按 archetype 实例化真实 GLTF 世界对象；道路/水体仍以生成 ribbon 表达，但 source archetype 已记录 road decal、water surface、edge blend、LOD/instancing 和 per-cell budget 元数据。
- game runtime 已把 cooked object cell pack 转成道路、水体、POI 和道具的可见实例；collision pack 已进入玩家水平阻挡解析，并记录 vegetation query-clearance 策略；nav pack 已记录 cross-cell portal link，作为后续 AI 查询和调试可视化的跨 cell 连接入口。
- 地形、水体/道路对象、paint、vegetation 和 cooked nav 已收敛到共享 world semantics 规则，避免各生成脚本各自维护一套道路、水体和 POI 语义。
- terrain、paint、vegetation、objects、collision 和 nav 的生成依赖已由 generation graph 显式登记；`scripts/map-generation/world-rebuild-planner.mjs` 可把 graph 输入变化解析为 stage closure 与 region/cell scope，`pnpm cook:map` 已支持 dry-run plan 与 scoped cook。
- 编辑器设置面板已有 World Diagnostics 页，可查看 generation graph、rebuild executor、local scope、预算、source 资产健康、pack integrity、cooked source stale、rebuild plan 命令、partition streaming、runtime payload 和可见对象/植被统计；Objects 页已支持 archetype 选择、地形拾取放置、删除、undo/redo 和对象 sidecar 保存。
- CI/release 已接入 `pnpm verify`，覆盖 lint、Node 回归测试、TypeScript 类型检查和地图资产校验。
- 已有 [`OPEN_WORLD_DESIGN_SPEC.md`](OPEN_WORLD_DESIGN_SPEC.md)，定义 `main` 10 平方公里地图的区域、道路、水系、兴趣点和生成约束。

当前最重要的方向是把这些能力从“已有可审查局部 cook 计划”推进到“编辑器可受控执行、可恢复、可预算化的非破坏性内容生产系统”。

## 当前编辑器质量判断

地形、纹理和植被编辑已经具备正确的 sidecar/cell 底座，但还不是业界最佳开放世界方案：

- 地形编辑当前以高度画刷和 procedural 生成结合为主，generation graph 已记录道路切坡、河床、平台、侵蚀、噪声和手工 override 的 operation；下一阶段要把这些 operation 变成编辑器可调、可禁用、可局部执行的非破坏性层。
- 纹理编辑当前是 splat paint 和 region dirty save，generation graph 已记录 slope/height/wetness/road-distance/biome/decal/macro variation 规则；下一阶段要把 material/biome graph 与手工 paint override 合并成可局部重算的材质工作流。
- 植被编辑当前已有 GLTF instancing、LOD、距离裁剪和画刷，generation graph 已记录 biome、cluster、edge falloff、保护区/排除区、impostor 与 collision/nav 预算规则；下一阶段要把 ecology scatter executor 接进编辑器局部重散布。
- 世界对象编辑已从几何代理进入 GLTF archetype + sidecar 事务阶段；source archetype 已登记 spline、prefab、scatter、LOD/instancing budget 和 collision 元数据，仍需补真正的 spline 编辑 UI、prefab 展开执行器、精确 collision shape 和可视化验证。

因此当前项目已经具备业界级开放世界管线的关键底座：可校验 source/cooked 分层、world partition、content-addressed package、generation graph、局部 rebuild plan、scoped cook 和编辑器内 dry-run 命令计划。距离最终“业界最佳编辑体验”还差受控一键执行、真实 spline 工具、可视化 collision/nav 调试、预算化渲染闭环和更高质量美术内容填充。

## 路线图

### 1. 统一资产事务模型

目标：terrain、paint、vegetation 和 world object sidecar 资产使用统一提交协议。

当前重点：

- 所有 region pack 先完整写入，再提交 JSON manifest，最后清理旧 pack。
- 保持 terrain、paint、vegetation、world object 共享 sidecar commit 抽象。
- 加载路径要能识别 manifest 指向的 pack 是否缺失、截断或格式不匹配。

验收标准：

- 任意一次保存失败都不会让最新 manifest 指向不存在或不完整的 pack。
- 旧 pack 只在新 manifest 成功提交后删除。
- terrain、paint、vegetation、world object 的保存顺序和错误处理语义一致。

### 2. 资产完整性与版本治理

目标：所有核心资产可校验、可诊断、可迁移。

当前重点：

- 保持 terrain、paint、vegetation manifest 中的 `regionIntegrity` 与实际 pack 同步。
- 加载时严格校验格式、长度、mask、索引和 SHA-256。
- 扩展地图资产健康检查工具，继续覆盖 cooked 输出、world partition 索引、过期 cook 和孤儿文件。

验收标准：

- 损坏的 `.heightpack`、`.paintpack`、`.vegpack` 能被明确报错定位。
- manifest 与 pack 不一致时不静默降级成空内容。
- 格式升级有清晰的版本判断和迁移策略。

### 3. Cooked Build 与 Source Asset 分层

目标：编辑器格式服务创作，游戏运行格式服务加载性能。

当前重点：

- 保留 `kunlun_wilds/maps/main` 作为默认 source project。
- 增加 cooked map pipeline，把编辑器 sidecar 资产转换成游戏运行时更高效的资源包或索引。
- 避免运行时依赖大量 JSON 解析、base64 转换和散文件随机读取。

验收标准：

- web game target 能从 cooked 数据启动，并拥有 cooked partition runtime/cell-pack loader。
- cooked build 支持 build input signature、cache hit 判断、stale cache 诊断和 content-addressed artifact index。
- source 与 cooked 的版本、hash 和生成来源可追踪。

### 4. World Partition 世界分区

目标：从单独 page/region streaming 进化到统一 world partition。

当前重点：

- 建立统一 cell 坐标体系，挂载 terrain、paint、vegetation、objects、collision、nav、audio 和事件数据。
- 保持 cooked partition dependency schema 作为 object/collision/nav/audio/event 分区资产的统一入口。
- 在现有 object/collision/nav 加载和基础实例化之上，继续设计加载优先级、取消策略、IO budget、帧预算和跨 cell 生命周期。
- 编辑器继续扩展分区可视化、加载状态调试和 cell 边界诊断。

验收标准：

- 玩家/摄像机移动时，terrain 与 object/collision/nav cell pack 已按统一 cell 生命周期规划；object 已有基础可见实例，collision 已进入玩家阻挡，nav 已进入运行时缓存。
- 不同资产类型共享坐标、边界和调度策略。
- 流式加载不会产生明显卡顿或内容突然消失。

### 5. 自动化测试与回归保护

目标：关键资产管线不靠手工验证维持正确性。

当前重点：

- 为 height/paint/vegetation/object pack 编解码补测试。
- 为 dirty save、manifest-last commit、缺失 pack、截断 pack、恢复路径补测试。
- 为地图生成脚本增加最小产物校验。
- 保持 `pnpm verify` 作为本地与 CI 共同质量门禁。

验收标准：

- 核心资产格式修改必须有自动化测试覆盖。
- 崩溃恢复和损坏检测有可重复验证。
- CI 或本地验证命令能在提交前发现主要资产格式回归。

### 6. 10 平方公里世界设计规格

目标：让 `main` 成为可持续扩展的开放世界样板，而不是随机测试地图。

当前重点：

- 按 [`OPEN_WORLD_DESIGN_SPEC.md`](OPEN_WORLD_DESIGN_SPEC.md) 推进道路骨架、河流/水体、山谷、山脊、林地、开阔地、据点和地标位置。
- 明确玩家出生路线、早期视线引导、兴趣点密度和区域主题。
- 把地图设计约束转成可执行的生成参数和编辑器工作流。

验收标准：

- `main` 有清晰的区域分层、移动路线和地标节奏。
- 任何地形、植被或材质生成都服务世界设计，而不是单纯随机填充。
- 地图能支持探索、战斗、导航和未来任务内容。

### 7. 地貌系统升级

目标：从基础高度生成进化到可玩的自然地貌。

当前重点：

- 引入侵蚀、河床、坡度控制、道路切割、平台和悬崖规则。
- 生成时考虑通行性、视线、战斗空间和道路连接。
- 编辑器支持局部重建和手工修整，不强迫全图重算。
- 建立非破坏性 terrain operation graph，使 procedural 层、spline 切坡层和手工修整层可单独重算、禁用和审查。

验收标准：

- 地形既自然又可玩，主要路线不被不可控坡度破坏。
- 道路、水体和地形边缘自然融合。
- 局部编辑不会破坏全局地貌一致性。

### 8. 材质系统升级

目标：让 10 平方公里地表有生态逻辑和细节变化。

当前重点：

- 增加 slope/height/biome 自动材质规则。
- 支持 macro variation、detail normal、湿度、泥土、岩石和道路边缘混合。
- paint 数据继续保持 region pack 和 dirty save。
- 建立 material/biome graph，把手工 paint 作为 override/mask，而不是唯一来源。

验收标准：

- 大尺度观察不重复，小尺度观察有可信细节。
- 道路、水边、坡面、林地和岩区材质过渡自然。
- 运行时材质采样成本符合性能预算。

### 9. 植被生态规则

目标：植被分布从随机散点升级为可解释生态系统。

当前重点：

- 按 biome、坡度、高度、湿度、朝向、道路距离和水源距离分布。
- 支持 cluster、clearing、edge falloff、密度图和手工保护区。
- 生成 LOD、impostor、碰撞和阴影策略。
- 建立 ecology scatter graph，并把道路、水体、object 清理、collision/nav 预算作为可验证输入。

验收标准：

- 林地、草地、灌木和稀疏区域有自然边界。
- 道路、水体和建筑周围的植被清理可信。
- 植被 instance 数、draw call 和 GPU memory 在预算内。

### 10. 道路、水体、岩石、建筑等世界对象管线

目标：补齐开放世界的人工痕迹与地貌融合层。

当前重点：

- 建立 spline road 和 river 工具。
- 支持 mesh/decal/prop placement、岩石散布、围栏、路牌、小建筑和据点对象。
- world object 已接入分区、校验、cooked build、真实 GLTF archetype 渲染和编辑事务提交；下一步补齐 spline 工具、prefab 展开、scatter rule 执行和可视化调试。

验收标准：

- 道路当前已生成导航成本，并已影响地形、材质和植被清理；后续需要 spline 编辑工具、道路 mesh/decal、车辙和更自然的边缘融合。
- 水体当前已进入 object/collision/nav 派生，并影响地形、边缘材质和植被清理；后续需要更真实的河床高度、可视水面、湿地物种和浅/深水规则。
- 世界对象能按 cell 被 runtime 预取并以真实 mesh/prop archetype 实例化；后续要补道路 decal/mesh、水面 shader、object instancing/LOD budget 和精确碰撞形状。

### 11. 渲染质量与性能预算

目标：以明确预算驱动 WebGPU 开放世界渲染。

当前重点：

- 定义目标帧率、目标设备、draw call、GPU memory、terrain page、vegetation instance 和 texture array 预算。
- 建立 LOD、culling、instancing、texture streaming 和 shader warmup 策略。
- 编辑器和游戏都显示关键性能指标。

验收标准：

- 典型场景能稳定达到目标帧率。
- 性能瓶颈能被指标定位，而不是靠体感猜测。
- 新功能必须说明对预算的影响。

### 12. 物理、碰撞和导航

目标：让地图从视觉场景变成可玩空间。

当前重点：

- 继续强化已生成的 terrain/object/water collision pack，补 vegetation collision 策略和更精确的形状表达。
- 继续强化已生成的 navigation grid，补跨 cell link、AI 查询接口、调试可视化和局部重建。
- 编辑器继续补可行走区域、碰撞边界和导航问题的可视化。

验收标准：

- 玩家、AI 和载具未来可在同一地图约束下运行。
- 地形修改能触发局部碰撞和导航重建。
- 不可达区域、悬空物和碰撞穿透可被检测。

### 13. 天气、时间、光照和氛围

目标：建立服务开放世界体验的环境系统。

当前重点：

- 昼夜循环、太阳/月亮、云、雾、雨、湿度、风和色调统一建模。
- 区域可覆盖环境参数，支持山谷、林地、水边和开阔地差异。
- 环境变化影响材质、植被摆动、能见度和天空。

验收标准：

- 同一地点在不同时段和天气下仍然可信。
- 环境系统有可编辑参数和运行时预算。
- 光照、雾和天空不会破坏 gameplay 可读性。

### 14. 游戏对象与任务层

目标：让地图能承载开放世界玩法内容。

当前重点：

- 建立 spawn、encounter、trigger、任务区域、交互对象和调试可视化。
- 数据也应按 world partition 组织。
- 区分编辑器 authoring 数据与运行时 cooked 数据。

验收标准：

- 内容设计可以把事件挂到地图区域、道路、地标和兴趣点。
- 运行时加载任务和对象不破坏流式预算。
- 编辑器能定位、过滤和验证 gameplay 数据。

### 15. 编辑器专业化

目标：把编辑器从“能编辑”提升到“能生产”。

当前重点：

- 在已有 World Diagnostics 基础上继续增强 region/cell 可视化、streaming debug、LOD debug、保存状态、地图统计、cooked stale 诊断和 rebuild command plan。
- 在已具备 dry-run/cook 命令计划的基础上，补受控平台执行能力、批量重建、区域锁定、局部重新生成、灾难恢复提示和验证结果跳转。
- 所有 UI 保持紧凑、严肃的桌面编辑器风格。

验收标准：

- 开发者能快速看到地图哪些区域已加载、已修改、损坏或超预算。
- 编辑器能辅助修复问题，而不是只显示错误。
- 常用工作流不需要手工翻文件。

### 16. 数据导入导出

目标：接入更专业的外部内容生产链。

当前重点：

- 支持 heightmap、spline、GLTF、材质、植被配置和对象表导入。
- 生成 LOD、碰撞、预览、hash 和 cooked metadata。
- 导入过程可重复、可增量、可验证。

验收标准：

- 外部资产进入项目后能被统一索引和校验。
- 重新导入不会破坏手工编辑区域，除非用户显式确认。
- 导入结果能进入 cooked build 和 world partition。

### 17. 打包发布管线

目标：让项目从编辑器生产顺畅进入游戏发布。

当前重点：

- 建立 cooked project 打包、资源索引、版本号、hash、增量构建和缓存失效。
- game target 默认读取 cooked 输出。
- 发布包包含资源完整性校验和最小运行验证。

验收标准：

- web 和 desktop game 都能从同一 cooked 数据模型启动。
- 发布前能自动发现缺失资源、过期 cook 和格式不匹配。
- 构建结果可追踪到 source project 和生成参数。

## 近期优先级

1. 在 World Diagnostics Rebuild Plan 基础上，为平台层增加受控 cook command capability，让 dirty region/cell 的 dry-run plan 可以在编辑器内安全执行，并补失败定位和恢复提示。
2. 把 terrain/material/ecology graph 从 metadata 推进到真正可执行：道路切坡、河床、湿边、道路清理、cluster/edge falloff 和手工 override 都能局部重算。
3. 强化 collision/nav 调试消费：cross-cell portal 可视化、AI 查询接口、可行走/阻挡 overlay、vegetation clearance 诊断和局部 nav rebuild 验证。
4. 把道路、水体和对象表现升级到真实渲染资产：road mesh/decal、water surface shader、prefab 展开、scatter rule 执行和对象 LOD/instancing budget。
5. 为 content-addressed cooked package 增加发布级压缩、重复 blob 清理、加载局部性排序和 release 校验。

## 路线对齐自检

每次完成地图相关工作后，至少检查：

- 本次改动是否推进了上述路线之一，还是只增加了短期复杂度。
- 是否保持 region/cell 化、可校验、可恢复、可 cook、可流式加载。
- 是否保留了编辑器 source 数据与游戏 cooked 数据分层的空间。
- 是否影响 10 平方公里 `main` 地图的内容质量、性能预算或生产效率。
- 是否需要更新本路线图、`AI_DEVELOPMENT_GUIDE.md` 或相关局部 README。