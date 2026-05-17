// loadBundledProject: read-only project loading for packaged game data.
// loadBundledProject：面向已打包游戏数据的只读项目加载。

import {
  createMapDataFromManifest,
  decodeHeightPageBytes,
  deserializeMapManifest,
  getHeightPagePathForKey,
  type MapData,
} from "@project/MapData";
import {
  createProjectMapRecord,
  deserializeProjectMetadata,
  getCurrentProjectMapId,
  type ProjectMapRecord,
  type ProjectMetadata,
} from "@project/ProjectData";
import { mergeSettingsWithDefaults, type GameSettings } from "@game/settings";
import {
  createPaintDataFromManifest,
  deserializePaintManifest,
  type TextureDefinition,
} from "@game/world/terrain/TextureData";
import {
  createVegetationDataFromManifest,
  deserializeVegetationManifest,
  getVegetationCellPathForKey,
  type VegetationMapData,
} from "@game/world/vegetation";

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
  const activeMapId = getCurrentProjectMapId(metadata);
  const mapDirectoryUrl = normalizeDirectoryUrl(resolveProjectUrl(projectBaseUrl, `maps/${activeMapId}/`));

  const [manifestJson, settingsJson] = await Promise.all([
    fetchRequiredText(resolveProjectUrl(mapDirectoryUrl, "map.json"), "map manifest"),
    fetchOptionalText(resolveProjectUrl(projectBaseUrl, "settings.json")),
  ]);

  const manifest = deserializeMapManifest(manifestJson);
  const activeMap = createProjectMapRecord(activeMapId, manifest.metadata);
  const [paintJson, vegetationJson] = await Promise.all([
    fetchOptionalText(resolveProjectUrl(mapDirectoryUrl, manifest.paintPath)),
    fetchOptionalText(resolveProjectUrl(mapDirectoryUrl, manifest.vegetationPath)),
  ]);

  const heightPageCache = new Map<string, ReturnType<NonNullable<MapData["loadHeightPage"]>>>();
  const map = createMapDataFromManifest(manifest, {});
  map.loadHeightPage = async (key) => {
    const cached = heightPageCache.get(key);
    if (cached) {
      return cached;
    }

    if (!map.heightPageKeys.includes(key)) {
      throw new Error(`Map height page '${key}' is not declared in the manifest`);
    }

    const request = (async () => {
      const bytes = await fetchRequiredBytes(
        resolveProjectUrl(mapDirectoryUrl, getHeightPagePathForKey(key)),
        `map height page ${key}`,
      );
      return { heights: decodeHeightPageBytes(bytes, manifest.terrain.height.pageResolution) };
    })();
    heightPageCache.set(key, request);
    return request;
  };

  const settings = mergeSettingsWithDefaults(settingsJson);
  const paintManifest = paintJson ? deserializePaintManifest(paintJson) : null;
  if (paintManifest) {
    map.paint = createPaintDataFromManifest(paintManifest);
  }

  const textureDefinition = paintManifest?.layers ?? null;
  const vegetationData = vegetationJson
    ? await loadBundledVegetationData(mapDirectoryUrl, vegetationJson)
    : null;

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

async function loadBundledVegetationData(
  mapDirectoryUrl: string,
  vegetationJson: string,
): Promise<VegetationMapData> {
  const manifest = deserializeVegetationManifest(vegetationJson);
  const cellEntries = await Promise.all(
    manifest.instances.cellKeys.map(async (key) => {
      const bytes = await fetchRequiredBytes(
        resolveProjectUrl(mapDirectoryUrl, getVegetationCellPathForKey(key)),
        `vegetation cell ${key}`,
      );
      return [key, bytes] as const;
    }),
  );

  return createVegetationDataFromManifest(manifest, Object.fromEntries(cellEntries));
}
