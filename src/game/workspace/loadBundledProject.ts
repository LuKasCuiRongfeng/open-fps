// loadBundledProject: read-only project loading for packaged game data.
// loadBundledProject：面向已打包游戏数据的只读项目加载。

import {
  createMapDataFromManifest,
  decodeHeightChunkBytes,
  deserializeMapManifest,
  type ChunkHeightData,
  type MapData,
} from "@project/MapData";
import {
  deserializeProjectMetadata,
  getCurrentProjectMapRecord,
  type ProjectMapRecord,
  type ProjectMetadata,
} from "@project/ProjectData";
import { mergeSettingsWithDefaults, type GameSettings } from "@game/settings";
import type { TextureDefinition } from "@game/world/terrain/TextureData";
import { deserializeVegetationData, type VegetationMapData } from "@game/world/vegetation";

export const DEFAULT_BUNDLED_PROJECT_URL = "/game-data/test_pro/";

export interface BundledGameProject {
  projectBaseUrl: string;
  metadata: ProjectMetadata;
  activeMap: ProjectMapRecord;
  mapDirectoryUrl: string;
  map: MapData;
  settings: GameSettings;
  textureDefinition: TextureDefinition | null;
  vegetationData: VegetationMapData | null;
}

function normalizeDirectoryUrl(path: string): string {
  const baseUrl = typeof window === "undefined" ? "http://localhost/" : window.location.href;
  const resolved = new URL(path, baseUrl).href;
  return resolved.endsWith("/") ? resolved : `${resolved}/`;
}

function resolveProjectUrl(projectBaseUrl: string, relativePath: string): string {
  return new URL(relativePath, projectBaseUrl).href;
}

async function fetchRequiredText(url: string, label: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to load ${label}: ${response.status} ${response.statusText}`);
  }

  return response.text();
}

async function fetchOptionalText(url: string): Promise<string | null> {
  const response = await fetch(url);
  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw new Error(`Failed to load optional project file: ${response.status} ${response.statusText}`);
  }

  const text = await response.text();
  return text.trim() ? text : null;
}

async function fetchRequiredBytes(url: string, label: string): Promise<Uint8Array> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to load ${label}: ${response.status} ${response.statusText}`);
  }

  return new Uint8Array(await response.arrayBuffer());
}

export async function loadBundledGameProject(
  projectUrl: string = DEFAULT_BUNDLED_PROJECT_URL,
): Promise<BundledGameProject> {
  const projectBaseUrl = normalizeDirectoryUrl(projectUrl);
  const metadataJson = await fetchRequiredText(
    resolveProjectUrl(projectBaseUrl, "project.json"),
    "project metadata",
  );
  const metadata = deserializeProjectMetadata(metadataJson);
  const activeMap = getCurrentProjectMapRecord(metadata);
  const mapDirectoryUrl = normalizeDirectoryUrl(resolveProjectUrl(projectBaseUrl, `maps/${activeMap.id}/`));

  const [manifestJson, settingsJson, textureJson, vegetationJson] = await Promise.all([
    fetchRequiredText(resolveProjectUrl(mapDirectoryUrl, "map.json"), "map manifest"),
    fetchOptionalText(resolveProjectUrl(projectBaseUrl, "settings.json")),
    fetchOptionalText(resolveProjectUrl(mapDirectoryUrl, "texture.json")),
    fetchOptionalText(resolveProjectUrl(mapDirectoryUrl, "vegetation.json")),
  ]);

  const manifest = deserializeMapManifest(manifestJson);
  const chunkEntries = await Promise.all(
    Object.entries(manifest.chunks).map(async ([key, reference]) => {
      const bytes = await fetchRequiredBytes(resolveProjectUrl(mapDirectoryUrl, reference.path), `map chunk ${key}`);
      return [key, { heights: decodeHeightChunkBytes(bytes, manifest.tileResolution) }] as const;
    }),
  );

  const chunks: Record<string, ChunkHeightData> = Object.fromEntries(chunkEntries);
  const map = createMapDataFromManifest(manifest, chunks);
  const settings = mergeSettingsWithDefaults(settingsJson);
  const textureDefinition = textureJson ? JSON.parse(textureJson) as TextureDefinition : null;
  const vegetationData = vegetationJson ? deserializeVegetationData(vegetationJson) : null;

  return {
    projectBaseUrl,
    metadata,
    activeMap,
    mapDirectoryUrl,
    map,
    settings,
    textureDefinition,
    vegetationData,
  };
}
