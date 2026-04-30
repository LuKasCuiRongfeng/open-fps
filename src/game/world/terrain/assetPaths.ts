// assetPaths: shared terrain asset path joining for filesystem projects and bundled URLs.
// assetPaths：同时支持文件系统项目和随包 URL 的地形资源路径拼接。

function normalizeDirectoryPath(path: string): string {
  return path.endsWith("/") ? path : `${path}/`;
}

export function resolveTerrainAssetPath(projectPath: string, relativePath: string): string {
  if (/^[a-z]+:\/\//i.test(projectPath)) {
    return new URL(relativePath, normalizeDirectoryPath(projectPath)).href;
  }

  return `${projectPath}/${relativePath}`;
}
