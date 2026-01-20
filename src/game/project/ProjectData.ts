// ProjectData: project folder structure and serialization.
// ProjectData：项目文件夹结构和序列化

import type { MapData } from "./MapData";
import type { GameSettings } from "../settings/GameSettings";

/**
 * Project metadata.
 * 项目元数据
 */
export interface ProjectMetadata {
  // Project name (folder name).
  // 项目名称（文件夹名称）
  name: string;
  // Creation timestamp.
  // 创建时间戳
  created: number;
  // Last modified timestamp.
  // 最后修改时间戳
  modified: number;
  // Project format version.
  // 项目格式版本
  version: number;
}

/**
 * Project data structure.
 * 项目数据结构
 *
 * Project folder structure:
 * /project-name/
 *   project.json      - Project metadata
 *   map.json          - Terrain/map data
 *   settings.json     - User settings
 *   /assets/          - Future: custom assets
 *
 * 项目文件夹结构：
 * /project-name/
 *   project.json      - 项目元数据
 *   map.json          - 地形/地图数据
 *   settings.json     - 用户设置
 *   /assets/          - 未来：自定义资产
 */
export interface ProjectData {
  metadata: ProjectMetadata;
  map: MapData;
  settings: GameSettings;
}

// Current project format version.
// 当前项目格式版本
export const PROJECT_VERSION = 1;

/**
 * Project file names.
 * 项目文件名
 */
export const PROJECT_FILES = {
  metadata: "project.json",
  map: "map.json",
  settings: "settings.json",
} as const;

/**
 * Create project metadata.
 * 创建项目元数据
 */
export function createProjectMetadata(name: string): ProjectMetadata {
  const now = Date.now();
  return {
    name,
    created: now,
    modified: now,
    version: PROJECT_VERSION,
  };
}

/**
 * Serialize project metadata to JSON.
 * 序列化项目元数据为 JSON
 */
export function serializeProjectMetadata(metadata: ProjectMetadata): string {
  return JSON.stringify(metadata, null, 2);
}

/**
 * Deserialize project metadata from JSON.
 * 从 JSON 反序列化项目元数据
 */
export function deserializeProjectMetadata(json: string): ProjectMetadata {
  return JSON.parse(json) as ProjectMetadata;
}
