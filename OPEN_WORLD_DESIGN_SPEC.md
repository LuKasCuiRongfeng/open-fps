# `main` 10 平方公里世界设计规格

本文档定义 `main` 地图从测试地形走向小型高密度开放世界样板的内容目标。它服务生成脚本、编辑器工具、world object、collision、nav 和 cooked build，而不是静态设定文案。

## 基准约束

- 当前地图：`3200m x 3200m`，约 10.24 平方公里。
- 当前页格：50 x 50 个 64m page。
- 当前 world partition：8-page cell，约 512m x 512m；边缘 cell 会按世界边界裁切。
- 扩展预留：未来若扩到约 20 平方公里，优先选择 `4480m x 4480m`，即 70 x 70 个 64m page。
- 内容气质：自然边境盆地，强调山脊、谷地、林地、水系、道路、据点和可读地标的组合。

## 区域结构

`main` 分为 5 个主区域，所有生成、object placement、collision 和 nav 都应能按区域过滤或加权：

1. 中央盆地
   - 功能：玩家早期活动区、道路交汇、低坡度可通行空间。
   - 内容：草地、稀疏树群、小路、营地、低风险遭遇。
   - 约束：保持稳定视线引导，不用密林遮死主要地标。

2. 北部山脊
   - 功能：远景轮廓、垂直探索、天然边界。
   - 内容：岩石、针叶林、陡坡、观景点、废弃哨站。
   - 约束：主路径坡度需要可导航；不可通行悬崖必须进入 collision/nav 诊断。

3. 东部林地
   - 功能：密度变化、遮蔽、近距离探索。
   - 内容：高密度植被、清理带、林中小径、狩猎/伏击空间。
   - 约束：道路和兴趣点周围必须清理植被，避免 nav 被随机实例堵死。

4. 南部湿地与河口
   - 功能：水体、泥地、低速移动和材质变化样板。
   - 内容：浅水、湿泥、芦苇、断桥、低洼营地。
   - 约束：水边材质、碰撞高度和 nav 成本必须一致。

5. 西部开阔地
   - 功能：长视距、载具/骑乘预留、战斗空间。
   - 内容：草原、风化岩、围栏、路牌、废弃农舍。
   - 约束：避免重复纹理大面积铺开；需要 macro variation 和地标打破空旷感。

## 道路骨架

道路系统按三层组织：

- 主环路：连接中央盆地、东部林地、南部湿地、西部开阔地，承担玩家主要移动线。
- 山脊支路：从中央盆地向北部山脊爬升，承担视线引导和地标展示。
- 隐藏小径：连接林地、湿地和废弃据点，承担探索奖励和可选路线。

道路进入生产管线时必须同时影响：

- terrain：切坡、平整、边缘过渡。
- paint：泥土、碎石、湿边、车辙或踩踏痕迹。
- vegetation：道路中心清空，边缘渐变回填。
- nav：降低道路移动成本，标记不可行走断点。
- objects：围栏、路牌、桥、营地、道具沿道路挂载。

## 水系

水系先以可控 spline 表达，不使用纯随机水体：

- 主河：从北部山脊流向南部湿地，穿过中央盆地边缘。
- 支流：东部林地提供一条小溪，汇入主河。
- 静水：南部湿地保留浅水洼和泥滩。

水体生产约束：

- 河床应影响 terrain 高度和坡度。
- 水边 paint 需要湿度、泥土、草地过渡。
- vegetation 需要水边物种和清理带。
- collision/nav 需要区分浅水、深水、不可通行边界。

## 兴趣点密度

兴趣点按 cell 预算，而不是全图随机撒点：

- 每个 512m partition cell 最多 1 个主兴趣点。
- 每个主兴趣点周围可以有 2 到 4 个次级细节物。
- 中央盆地和主环路附近密度最高，北部山脊和西部开阔地密度较低。
- 所有兴趣点必须能追踪到 object/collision/nav cooked cell 依赖。

初始兴趣点类型：

- 营地：玩家早期识别和可互动样板。
- 废弃哨站：高处地标和视线奖励。
- 断桥：道路、水体、collision、nav 联动样板。
- 小农舍：object streaming 和室外遮挡样板。
- 林中空地：植被清理、遭遇和导航样板。

## 生成参数约束

后续地形、材质、植被和 object 生成都应读取同一套区域语义：

- height：区域坡度、山脊、谷地和河床优先于纯噪声。
- paint：以 biome、坡度、高度、湿度、道路距离和水源距离驱动。
- vegetation：以 biome、坡度、高度、湿度、道路距离、水源距离和 object 清理半径驱动。
- objects：按道路、水体、区域主题和兴趣点规则生成。
- collision：由 terrain/object/vegetation 的 cooked 结果派生。
- nav：由 terrain slope、水体、道路、object blockers 和 collision 派生。

## 当前落地状态

- `test_pro/assets` 已按项目级资产库组织：`registry.json` 记录模型、材质、用途、预算、来源和授权，`sources/polyhaven/.../source.json` 保留 CC0 来源元数据，`imported/models` 与 `imported/materials` 保存生成脚本和 cooked build 可引用的导入产物。
- `scripts/map-generation/world-object-assets.mjs` 已按本文档生成首批 source world objects：主环路、山脊支路、林中小径、主河、支流、5 个 POI 和若干道路/据点道具。
- `objects/manifest.json` 已按 512m partition cell 写入 `.objectpack`，记录 byte length 与 SHA-256，并包含 archetype render/editor/scatter/validation 元数据。
- cooked manifest v4 已把 asset registry 和 source objects 纳入 build input signature；object cooked cell pack 复制 source object pack，并把注册过的世界对象 GLTF archetype 资产复制到 `cooked/assets/imported/...` package。
- collision cooked cell pack 已由 terrain heightfield、水体 volume、POI/prop blocker 派生。
- nav cooked cell pack 已由 terrain slope、road cost、water blocker/cost 和 object blocker 派生粗粒度 grid。
- game runtime 已接入 cooked world partition planner，并按玩家/摄像机位置加载 object/collision/nav cell pack。
- game runtime 已把 object cell pack 实例化为道路/水体 ribbon 和 GLTF POI/prop archetype；collision pack 已进入玩家水平阻挡解析，nav pack 已进入运行时缓存。
- terrain、paint、vegetation、objects 和 cooked nav 已使用共享 world semantics 规则，使道路、水体和 POI 同时影响地形、材质、植被清理、对象和导航。
- 编辑器已有 World Diagnostics 页，可检查 source pack integrity、资产健康、partition payload 和 streaming 运行状态；Objects 页已支持 archetype 选择、地形拾取放置、删除、undo/redo 和 manifest-last 保存。
- validator 已强制 source paint/vegetation/world object 只能引用注册过的 imported 资产，并禁止旧 `assets/model`、`assets/texture` 裸目录回流。

## 编辑器质量目标

当前 terrain/paint/vegetation 编辑器已经有正确的数据分层，但还不是最终业界最佳编辑体验。后续设计必须按以下目标演进：

- terrain：从高度画刷升级为非破坏性 operation graph，支持道路切坡、河床、平台、侵蚀、噪声和手工修整的局部重算。
- paint：从手工 splat paint 升级为 material/biome graph，支持 slope/height/wetness/road-distance masks、macro variation、detail normals、车辙、湿边和手工 override。
- vegetation：从画刷实例升级为 ecology scatter graph，支持 biome mask、cluster、edge falloff、保护区/排除区、impostor/LOD/collision/nav 预算。
- objects：从单点 GLTF placement 继续升级为 spline road/river/fence、prefab 展开、scatter rules、精确 collision shape、LOD/instancing budget 和可视化验证。

这些目标优先服务 `main` 的 10 平方公里样板；不要为了保留当前生成结果而阻止局部重建或资产格式升级。

## 验收标准

进入下一阶段前，`main` 至少应满足：

- 有可视化道路主环路和至少一条山脊支路。
- 有主河、支流和南部湿地原型。
- 至少 5 类兴趣点能进入 object cooked cell。
- terrain/paint/vegetation/object/collision/nav 都能按 partition cell 追踪依赖。
- validator 能发现缺失 object/collision/nav pack、过期 cook、hash mismatch 和 package blob 缺失。
- runtime world partition planner 能根据玩家位置给出 load/keep/unload cell 和跨资产 dependency 列表，并能加载 object/collision/nav payload。

已满足的基础项仍不代表最终开放世界质量完成；下一阶段重点是真实道路/水体表现、非破坏性地貌/材质/植被规则图、跨 cell nav link、碰撞/导航可视化、object spline/prefab/scatter 工具和局部重建工具。

## 非目标

- 当前不追求最终美术质量。
- 当前不追求任务系统完整实现。
- 当前不追求 20 平方公里扩图，必须先让 10 平方公里样板的管线正确。
- 当前不为保留临时测试刷图牺牲道路、水体、object、collision 或 nav 管线。
