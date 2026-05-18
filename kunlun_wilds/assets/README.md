# 资产库

`kunlun_wilds/assets` 是默认资产项目的项目级内容库，不再作为裸文件堆放目录使用。

`Kunlun Wilds` 以中国神话中的昆仑意象命名：昆仑是神话中的世界轴、仙山与边界之地，契合开放世界项目的探索、地貌和长期内容生产定位。

- `registry.json` 是资产注册表，记录公开来源、授权、导入产物、用途和基础预算。
- `sources/` 保存外部公开资源的来源元数据；当前公开资产均来自 Poly Haven，授权为 CC0。
- `imported/` 保存编辑器与生成脚本可直接引用的导入产物。

地图、植被、材质和世界对象只能引用 `registry.json` 中声明过的 `imported` 资产。简单几何体只能用于 gizmo、debug overlay、collision/nav 诊断或临时调试，不能作为最终美术内容。

新增资产时必须同时补齐三件事：导入产物放入 `imported/models` 或 `imported/materials`，来源授权写入 `sources/<provider>/<asset-id>/source.json`，并在 `registry.json` 登记用途与文件清单。完成后运行 `pnpm validate:map`，确认没有未登记文件、旧目录或未授权来源。