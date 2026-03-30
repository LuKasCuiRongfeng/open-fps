// Legacy game barrel.
// 旧 game 桶导出
//
// Keep this surface intentionally small. New code should import from domain paths
// such as @game/app, @game/editor, @game/world, or @game/settings directly.
// 保持这个导出面尽量小。新代码应直接从 @game/app、@game/editor、
// @game/world 或 @game/settings 等域路径导入。

export * from "./app";
export * from "./settings";
