// ProjectData: project folder structure and serialization.
// ProjectData：项目文件夹结构和序列化

import type { MapData } from "./MapData";
import type { GameSettings } from "@game/settings";

export interface ProjectMetadata {
  name: string;
  created: number;
  modified: number;
  version: number;
}

export interface ProjectData {
  metadata: ProjectMetadata;
  map: MapData;
  settings: GameSettings;
}

export const PROJECT_VERSION = 1;

export const PROJECT_FILES = {
  metadata: "project.json",
  map: "map.json",
  settings: "settings.json",
} as const;

export function createProjectMetadata(name: string): ProjectMetadata {
  const now = Date.now();
  return {
    name,
    created: now,
    modified: now,
    version: PROJECT_VERSION,
  };
}

export function serializeProjectMetadata(metadata: ProjectMetadata): string {
  return JSON.stringify(metadata, null, 2);
}

export function deserializeProjectMetadata(json: string): ProjectMetadata {
  return JSON.parse(json) as ProjectMetadata;
}