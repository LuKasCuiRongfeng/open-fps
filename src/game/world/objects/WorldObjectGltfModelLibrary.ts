// WorldObjectGltfModelLibrary: shared GLTF loading for authored world objects.
// WorldObjectGltfModelLibrary：世界对象 GLTF 资产的共享加载器。

import {
  Box3,
  Group,
  Material,
  Mesh,
  Object3D,
  Sphere,
} from "three/webgpu";
import { GLTFLoader, type GLTF } from "three/addons/loaders/GLTFLoader.js";
import { resolveAssetUrl } from "@/platform/assetUrls";
import { normalizeAssetPath } from "@/platform/pathUtils";
import type { WorldObjectEntry, WorldObjectRenderDefinition } from "./WorldObjectData";

type GltfJsonResource = {
  uri?: unknown;
};

type GltfJsonDocument = {
  buffers?: GltfJsonResource[];
  images?: GltfJsonResource[];
};

export interface LoadedWorldObjectModel {
  sourcePath: string;
  sourceUrl: string;
  root: Object3D;
  sourceHeightMeters: number;
  sourceMinY: number;
  sourceBoundsRadiusMeters: number;
}

const MIN_SOURCE_HEIGHT_METERS = 0.001;
const ABSOLUTE_URI_PATTERN = /^[a-z][a-z0-9+.-]*:/i;

export class WorldObjectGltfModelLibrary {
  private readonly loader = new GLTFLoader();
  private readonly loadedModels = new Map<string, LoadedWorldObjectModel>();
  private readonly loadingModels = new Map<string, Promise<LoadedWorldObjectModel>>();

  async loadModel(baseDirectory: string, render: WorldObjectRenderDefinition): Promise<LoadedWorldObjectModel> {
    if (!render.path) {
      throw new Error("World object GLTF render definition is missing a path");
    }

    const sourcePath = resolveObjectAssetPath(baseDirectory, render.path);
    const cacheKey = sourcePath;
    const loaded = this.loadedModels.get(cacheKey);
    if (loaded) {
      return loaded;
    }

    const loading = this.loadingModels.get(cacheKey);
    if (loading) {
      return loading;
    }

    const request = this.loadModelInternal(sourcePath, render)
      .then((model) => {
        this.loadedModels.set(cacheKey, model);
        return model;
      })
      .finally(() => {
        this.loadingModels.delete(cacheKey);
      });
    this.loadingModels.set(cacheKey, request);
    return request;
  }

  createInstance(model: LoadedWorldObjectModel, render: WorldObjectRenderDefinition, object: WorldObjectEntry): Group {
    const root = new Group();
    const instance = model.root.clone(true);
    const targetHeight = Math.max(MIN_SOURCE_HEIGHT_METERS, render.targetHeightMeters ?? object.radiusMeters ?? model.sourceHeightMeters);
    const baseScale = render.baseScale ?? 1;
    const objectScale = object.scale ?? 1;
    const scalar = (targetHeight / model.sourceHeightMeters) * baseScale * objectScale;

    root.name = `world-object-model-${object.id}`;
    root.position.set(object.position.x, object.position.y, object.position.z);
    root.rotation.y = object.rotationY ?? 0;
    root.scale.setScalar(scalar);
    instance.position.y = -model.sourceMinY;
    root.add(instance);
    return root;
  }

  dispose(): void {
    for (const model of this.loadedModels.values()) {
      model.root.traverse((object) => {
        if (!isMeshObject(object)) return;
        object.geometry.dispose();
        disposeMaterial(object.material);
      });
    }

    this.loadedModels.clear();
    this.loadingModels.clear();
  }

  private async loadModelInternal(sourcePath: string, render: WorldObjectRenderDefinition): Promise<LoadedWorldObjectModel> {
    const sourceUrl = await resolveAssetUrl(sourcePath);
    const gltf = await this.loadGltf(sourcePath, sourceUrl);
    const root = gltf.scene;
    root.updateMatrixWorld(true);
    root.traverse((object) => {
      if (!isMeshObject(object)) return;
      object.castShadow = render.castShadow ?? true;
      object.receiveShadow = render.receiveShadow ?? true;
    });

    const bounds = new Box3().setFromObject(root);
    const sourceHeightMeters = Math.max(MIN_SOURCE_HEIGHT_METERS, bounds.max.y - bounds.min.y);
    const sourceBoundsSphere = bounds.getBoundingSphere(new Sphere());
    const sourceBoundsRadiusMeters = Number.isFinite(sourceBoundsSphere.radius)
      ? Math.max(MIN_SOURCE_HEIGHT_METERS, sourceBoundsSphere.radius)
      : sourceHeightMeters;

    return {
      sourcePath,
      sourceUrl,
      root,
      sourceHeightMeters,
      sourceMinY: Number.isFinite(bounds.min.y) ? bounds.min.y : 0,
      sourceBoundsRadiusMeters,
    };
  }

  private async loadGltf(sourcePath: string, sourceUrl: string): Promise<GLTF> {
    const response = await fetch(sourceUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch world object model '${sourcePath}': ${response.status}`);
    }

    const sourceDirectory = getDirectoryPath(normalizeAssetPath(sourcePath));
    const data = await response.arrayBuffer();
    if (!isGltfJsonPath(sourcePath)) {
      return this.parseGltf(data, sourceDirectory);
    }

    const json = JSON.parse(new TextDecoder().decode(data)) as GltfJsonDocument;
    await rewriteGltfJsonResourceUris(json, sourceDirectory);
    return this.parseGltf(JSON.stringify(json), sourceDirectory);
  }

  private parseGltf(data: string | ArrayBuffer, resourcePath: string): Promise<GLTF> {
    return new Promise((resolve, reject) => {
      this.loader.parse(data, resourcePath, resolve, reject);
    });
  }
}

function resolveObjectAssetPath(baseDirectory: string, assetPath: string): string {
  if (/^[a-z]+:\/\//i.test(assetPath)) {
    return assetPath;
  }

  if (/^[a-z]+:\/\//i.test(baseDirectory)) {
    return new URL(assetPath, normalizeDirectoryPath(baseDirectory)).href;
  }

  return normalizeAssetPath(`${baseDirectory}/${assetPath}`);
}

function normalizeDirectoryPath(path: string): string {
  return path.endsWith("/") ? path : `${path}/`;
}

function getDirectoryPath(path: string): string {
  const normalized = path.replace(/\\/g, "/");
  const slashIndex = normalized.lastIndexOf("/");
  return slashIndex >= 0 ? normalized.slice(0, slashIndex + 1) : "";
}

function isRelativeResourceUri(uri: string): boolean {
  return !ABSOLUTE_URI_PATTERN.test(uri) && !uri.startsWith("//");
}

function isGltfJsonPath(path: string): boolean {
  return path.split(/[?#]/, 1)[0]?.toLowerCase().endsWith(".gltf") ?? false;
}

function resolveRelativeResourcePath(baseDirectory: string, uri: string): string {
  if (/^[a-z]+:\/\//i.test(baseDirectory)) {
    return new URL(uri, normalizeDirectoryPath(baseDirectory)).href;
  }

  return normalizeAssetPath(`${baseDirectory}${uri}`);
}

async function rewriteGltfJsonResourceUris(json: GltfJsonDocument, baseDirectory: string): Promise<void> {
  const resources = [...(json.buffers ?? []), ...(json.images ?? [])];
  await Promise.all(resources.map(async (resource) => {
    if (typeof resource.uri !== "string" || !isRelativeResourceUri(resource.uri)) {
      return;
    }

    const resourcePath = resolveRelativeResourcePath(baseDirectory, resource.uri);
    resource.uri = await resolveAssetUrl(resourcePath);
  }));
}

function isMeshObject(object: Object3D): object is Mesh {
  return (object as Mesh).isMesh === true;
}

function disposeMaterial(material: Material | Material[]): void {
  if (Array.isArray(material)) {
    for (const entry of material) {
      entry.dispose();
    }
    return;
  }

  material.dispose();
}
