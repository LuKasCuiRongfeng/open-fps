// VegetationScene: GLTF/GLB vegetation rendering with instanced meshes, LOD, and distance culling.
// VegetationScene：使用实例化网格、LOD 与距离裁剪渲染 GLTF/GLB 植被。

import {
  Box3,
  BufferGeometry,
  Group,
  InstancedMesh,
  Material,
  Matrix4,
  Mesh,
  Object3D,
  Quaternion,
  Vector3,
  type PerspectiveCamera,
} from "three/webgpu";
import { GLTFLoader, type GLTF } from "three/addons/loaders/GLTFLoader.js";
import { resolveAssetUrl } from "@/platform/assetUrls";
import { normalizeAssetPath } from "@/platform/pathUtils";
import type {
  VegetationInstance,
  VegetationMapData,
  VegetationModelDefinition,
  VegetationModelLevelStats,
  VegetationModelStats,
} from "./VegetationData";

type ModelMeshTemplate = {
  geometry: BufferGeometry;
  material: Material | Material[];
  localMatrix: Matrix4;
  castShadow: boolean;
  receiveShadow: boolean;
};

type VegetationLodConfig = {
  level: number;
  label: string;
  path: string;
  startDistanceMeters: number;
};

type LoadedVegetationModelLevel = {
  config: VegetationLodConfig;
  sourceUrl: string;
  root: Object3D;
  templates: ModelMeshTemplate[];
  sourceHeightMeters: number;
  sourceMinY: number;
  stats: VegetationModelLevelStats;
};

type LoadedVegetationModel = {
  definition: VegetationModelDefinition;
  signature: string;
  levels: LoadedVegetationModelLevel[];
};

type VegetationRenderBatch = {
  modelId: string;
  levelIndex: number;
  castsShadow: boolean;
  capacity: number;
  visibleCount: number;
  meshes: InstancedMesh[];
};

type GltfJsonResource = {
  uri?: unknown;
};

type GltfJsonDocument = {
  buffers?: GltfJsonResource[];
  images?: GltfJsonResource[];
};

const MIN_SOURCE_HEIGHT_METERS = 0.001;
const MIN_INSTANCE_CAPACITY = 32;
const VISIBILITY_UPDATE_DISTANCE_METERS = 3;
const VISIBILITY_UPDATE_DISTANCE_SQ = VISIBILITY_UPDATE_DISTANCE_METERS * VISIBILITY_UPDATE_DISTANCE_METERS;
const Y_AXIS = new Vector3(0, 1, 0);
const ABSOLUTE_URI_PATTERN = /^[a-z][a-z0-9+.-]*:/i;

function normalizeDirectoryPath(path: string): string {
  return path.endsWith("/") ? path : `${path}/`;
}

function resolveVegetationAssetPath(mapDirectory: string, assetPath: string): string {
  if (/^[a-z]+:\/\//i.test(assetPath)) {
    return assetPath;
  }

  if (/^[a-z]+:\/\//i.test(mapDirectory)) {
    return new URL(assetPath, normalizeDirectoryPath(mapDirectory)).href;
  }

  return `${mapDirectory}/${assetPath}`.replace(/\\/g, "/");
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

function getModelLodConfigs(definition: VegetationModelDefinition): VegetationLodConfig[] {
  const levels: VegetationLodConfig[] = [
    {
      level: 0,
      label: "LOD0",
      path: definition.path,
      startDistanceMeters: 0,
    },
  ];

  if (definition.lod1Path) {
    levels.push({
      level: 1,
      label: "LOD1",
      path: definition.lod1Path,
      startDistanceMeters: definition.lod1DistanceMeters,
    });
  }

  if (definition.lod2Path) {
    levels.push({
      level: 2,
      label: "LOD2",
      path: definition.lod2Path,
      startDistanceMeters: definition.lod2DistanceMeters,
    });
  }

  return levels.sort((a, b) => a.startDistanceMeters - b.startDistanceMeters);
}

function createModelSignature(definition: VegetationModelDefinition): string {
  return getModelLodConfigs(definition).map((config) => `${config.level}:${config.path}`).join("|");
}

function getModelInstanceCount(data: VegetationMapData, modelId: string): number {
  let count = 0;
  for (const instance of data.instances) {
    if (instance.modelId === modelId) {
      count += 1;
    }
  }
  return count;
}

function nextInstanceCapacity(count: number): number {
  let capacity = MIN_INSTANCE_CAPACITY;
  while (capacity < count) {
    capacity *= 2;
  }
  return capacity;
}

function getGeometryVertexCount(geometry: BufferGeometry): number {
  return geometry.getAttribute("position")?.count ?? 0;
}

function getGeometryTriangleCount(geometry: BufferGeometry): number {
  const indexCount = geometry.index?.count;
  if (indexCount !== undefined) {
    return Math.floor(indexCount / 3);
  }

  return Math.floor(getGeometryVertexCount(geometry) / 3);
}

function buildLevelStats(
  config: VegetationLodConfig,
  templates: readonly ModelMeshTemplate[],
  sourceHeightMeters: number,
): VegetationModelLevelStats {
  let vertices = 0;
  let triangles = 0;
  for (const template of templates) {
    vertices += getGeometryVertexCount(template.geometry);
    triangles += getGeometryTriangleCount(template.geometry);
  }

  return {
    level: config.level,
    label: config.label,
    path: config.path,
    loaded: true,
    vertices,
    triangles,
    primitives: templates.length,
    drawCalls: templates.length,
    sourceHeightMeters,
  };
}

/**
 * VegetationScene renders saved vegetation using InstancedMesh batches split by model, LOD, and shadow mode.
 * VegetationScene 按模型、LOD 和阴影模式拆分 InstancedMesh 批次来渲染已保存植被。
 */
export class VegetationScene {
  private readonly root = new Group();
  private readonly loader = new GLTFLoader();
  private readonly loadedModels = new Map<string, LoadedVegetationModel>();
  private readonly loadingModels = new Map<string, Promise<LoadedVegetationModel | null>>();
  private readonly modelBatches = new Map<string, VegetationRenderBatch[]>();
  private readonly position = new Vector3();
  private readonly scale = new Vector3();
  private readonly rotation = new Quaternion();
  private readonly rootMatrix = new Matrix4();
  private readonly offsetMatrix = new Matrix4();
  private readonly baseMatrix = new Matrix4();
  private readonly finalMatrix = new Matrix4();
  private readonly lastVisibilityCameraPosition = new Vector3(Number.NaN, Number.NaN, Number.NaN);
  private readonly changeSubscribers = new Set<() => void>();
  private mapDirectory = "";
  private data: VegetationMapData | null = null;
  private revision = 0;
  private visibilityDirty = true;

  constructor() {
    this.root.name = "vegetation-root";
  }

  attach(scene: Group | { add: (object: Object3D) => void }): void {
    scene.add(this.root);
  }

  detach(): void {
    this.root.removeFromParent();
  }

  subscribe(callback: () => void): () => void {
    this.changeSubscribers.add(callback);
    return () => {
      this.changeSubscribers.delete(callback);
    };
  }

  getModelStats(modelId: string): VegetationModelStats | null {
    const model = this.loadedModels.get(modelId);
    if (!model) return null;

    const levels = model.levels.map((level) => ({ ...level.stats }));
    return {
      modelId,
      levels,
      totalVertices: levels.reduce((sum, level) => sum + level.vertices, 0),
      totalTriangles: levels.reduce((sum, level) => sum + level.triangles, 0),
    };
  }

  async setData(mapDirectory: string, data: VegetationMapData | null): Promise<void> {
    this.mapDirectory = mapDirectory;
    this.data = data;
    await this.rebuildAsync();
  }

  requestRebuild(): void {
    void this.rebuildAsync();
  }

  syncInstances(modelId?: string): void {
    const data = this.data;
    if (!data) return;

    if (modelId) {
      this.ensureModelBatchCapacity(modelId, getModelInstanceCount(data, modelId));
    } else {
      for (const id of Object.keys(data.models)) {
        this.ensureModelBatchCapacity(id, getModelInstanceCount(data, id));
      }
    }

    this.visibilityDirty = true;
  }

  update(camera: PerspectiveCamera): void {
    const cameraPosition = camera.position;
    const movedDistanceSq = this.lastVisibilityCameraPosition.distanceToSquared(cameraPosition);
    if (!this.visibilityDirty && movedDistanceSq < VISIBILITY_UPDATE_DISTANCE_SQ) {
      return;
    }

    this.lastVisibilityCameraPosition.copy(cameraPosition);
    this.updateVisibleInstances();
  }

  clear(): void {
    this.data = null;
    this.clearRenderedMeshes();
  }

  dispose(): void {
    this.clearRenderedMeshes();
    for (const model of this.loadedModels.values()) {
      this.disposeLoadedModel(model);
    }
    this.loadedModels.clear();
    this.loadingModels.clear();
    this.detach();
  }

  private async rebuildAsync(): Promise<void> {
    const data = this.data;
    const mapDirectory = this.mapDirectory;
    const revision = this.revision + 1;
    this.revision = revision;

    if (!data || !mapDirectory) {
      this.clearRenderedMeshes();
      return;
    }

    await Promise.all(
      Object.values(data.models).map((definition) => this.ensureModelLoaded(mapDirectory, definition)),
    );

    if (this.revision !== revision || this.data !== data) {
      return;
    }

    this.disposeUnusedModels(data);
    this.rebuildRenderedMeshes(data);
    this.notifyChanged();
  }

  private async ensureModelLoaded(
    mapDirectory: string,
    definition: VegetationModelDefinition,
  ): Promise<LoadedVegetationModel | null> {
    const signature = createModelSignature(definition);
    const existing = this.loadedModels.get(definition.id);
    if (existing?.signature === signature) {
      existing.definition = definition;
      return existing;
    }

    const loading = this.loadingModels.get(definition.id);
    if (loading) {
      return loading;
    }

    const promise = this.loadModel(mapDirectory, definition, signature)
      .catch((error: unknown) => {
        console.warn(`[VegetationScene] Failed to load model '${definition.name}'`, error);
        return null;
      })
      .finally(() => {
        this.loadingModels.delete(definition.id);
      });
    this.loadingModels.set(definition.id, promise);
    return promise;
  }

  private async loadModel(
    mapDirectory: string,
    definition: VegetationModelDefinition,
    signature: string,
  ): Promise<LoadedVegetationModel> {
    const levels = await Promise.all(
      getModelLodConfigs(definition).map((config) => this.loadModelLevel(mapDirectory, definition, config)),
    );

    const previous = this.loadedModels.get(definition.id);
    if (previous) {
      this.clearModelBatches(definition.id);
      this.disposeLoadedModel(previous);
    }

    const loaded: LoadedVegetationModel = {
      definition,
      signature,
      levels,
    };
    this.loadedModels.set(definition.id, loaded);
    return loaded;
  }

  private async loadModelLevel(
    mapDirectory: string,
    definition: VegetationModelDefinition,
    config: VegetationLodConfig,
  ): Promise<LoadedVegetationModelLevel> {
    const sourcePath = resolveVegetationAssetPath(mapDirectory, config.path);
    const sourceUrl = await resolveAssetUrl(sourcePath);
    const gltf = await this.loadGltf(definition, sourcePath, sourceUrl);
    const root = gltf.scene;
    root.updateMatrixWorld(true);

    const bounds = new Box3().setFromObject(root);
    const sourceHeightMeters = Math.max(MIN_SOURCE_HEIGHT_METERS, bounds.max.y - bounds.min.y);
    const templates: ModelMeshTemplate[] = [];

    root.traverse((object) => {
      if (!isMeshObject(object)) return;

      object.castShadow = definition.castShadow;
      object.receiveShadow = definition.receiveShadow;
      templates.push({
        geometry: object.geometry,
        material: object.material,
        localMatrix: object.matrixWorld.clone(),
        castShadow: definition.castShadow,
        receiveShadow: definition.receiveShadow,
      });
    });

    return {
      config,
      sourceUrl,
      root,
      templates,
      sourceHeightMeters,
      sourceMinY: Number.isFinite(bounds.min.y) ? bounds.min.y : 0,
      stats: buildLevelStats(config, templates, sourceHeightMeters),
    };
  }

  private async loadGltf(
    definition: VegetationModelDefinition,
    sourcePath: string,
    sourceUrl: string,
  ): Promise<GLTF> {
    const response = await fetch(sourceUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch '${definition.name}': ${response.status}`);
    }

    const sourceDirectory = getDirectoryPath(normalizeAssetPath(sourcePath));
    const data = await response.arrayBuffer();

    if (!isGltfJsonPath(sourcePath)) {
      return this.parseGltf(data, sourceDirectory);
    }

    // EN: Tauri file URLs encode Windows paths as one URL segment, so GLTFLoader cannot infer sibling resources.
    // 中文: Tauri 文件 URL 会把 Windows 路径编码成单个 URL 片段，因此 GLTFLoader 无法自动推断同目录资源。
    const json = JSON.parse(new TextDecoder().decode(data)) as GltfJsonDocument;
    await rewriteGltfJsonResourceUris(json, sourceDirectory);
    return this.parseGltf(JSON.stringify(json), sourceDirectory);
  }

  private parseGltf(data: string | ArrayBuffer, resourcePath: string): Promise<GLTF> {
    return new Promise((resolve, reject) => {
      this.loader.parse(data, resourcePath, resolve, reject);
    });
  }

  private rebuildRenderedMeshes(data: VegetationMapData): void {
    this.clearRenderedMeshes();

    for (const [modelId] of Object.entries(data.models)) {
      const count = getModelInstanceCount(data, modelId);
      if (count > 0) {
        this.createModelBatches(modelId, nextInstanceCapacity(count));
      }
    }

    this.visibilityDirty = true;
  }

  private createModelBatches(modelId: string, capacity: number): void {
    const model = this.loadedModels.get(modelId);
    if (!model) return;

    const batches: VegetationRenderBatch[] = [];
    for (const level of model.levels) {
      for (const castsShadow of [true, false]) {
        const batch: VegetationRenderBatch = {
          modelId,
          levelIndex: level.config.level,
          castsShadow,
          capacity,
          visibleCount: 0,
          meshes: [],
        };

        for (const template of level.templates) {
          const mesh = new InstancedMesh(template.geometry, template.material, capacity);
          mesh.name = `vegetation-${modelId}-${level.config.label.toLowerCase()}-${castsShadow ? "shadow" : "unshadowed"}`;
          mesh.castShadow = template.castShadow && castsShadow;
          mesh.receiveShadow = template.receiveShadow;
          mesh.frustumCulled = true;
          mesh.count = 0;
          this.root.add(mesh);
          batch.meshes.push(mesh);
        }

        batches.push(batch);
      }
    }

    this.modelBatches.set(modelId, batches);
  }

  private clearModelBatches(modelId: string): void {
    const batches = this.modelBatches.get(modelId);
    if (!batches) return;

    for (const batch of batches) {
      for (const mesh of batch.meshes) {
        mesh.removeFromParent();
      }
    }

    this.modelBatches.delete(modelId);
  }

  private ensureModelBatchCapacity(modelId: string, requiredCount: number): void {
    if (requiredCount <= 0) {
      this.clearModelBatches(modelId);
      return;
    }

    const current = this.modelBatches.get(modelId)?.[0];
    if (current && current.capacity >= requiredCount) {
      return;
    }

    this.clearModelBatches(modelId);
    this.createModelBatches(modelId, nextInstanceCapacity(requiredCount));
  }

  private updateVisibleInstances(): void {
    const data = this.data;
    if (!data || Number.isNaN(this.lastVisibilityCameraPosition.x)) {
      return;
    }

    for (const batches of this.modelBatches.values()) {
      for (const batch of batches) {
        batch.visibleCount = 0;
        for (const mesh of batch.meshes) {
          mesh.count = 0;
        }
      }
    }

    for (const instance of data.instances) {
      const model = this.loadedModels.get(instance.modelId);
      if (!model) continue;

      const distanceMeters = this.getHorizontalCameraDistance(instance);
      if (distanceMeters > model.definition.maxVisibleDistanceMeters) {
        continue;
      }

      const level = this.resolveLodLevel(model, distanceMeters);
      const castsShadow = model.definition.castShadow && distanceMeters <= model.definition.shadowDistanceMeters;
      const batch = this.getRenderBatch(instance.modelId, level.config.level, castsShadow);
      if (!batch || batch.visibleCount >= batch.capacity) continue;

      for (let index = 0; index < batch.meshes.length; index += 1) {
        this.writeInstanceMatrix(level, level.templates[index], instance, batch.meshes[index], batch.visibleCount);
      }
      batch.visibleCount += 1;
    }

    for (const batches of this.modelBatches.values()) {
      for (const batch of batches) {
        for (const mesh of batch.meshes) {
          mesh.count = batch.visibleCount;
          mesh.instanceMatrix.needsUpdate = true;
          if (batch.visibleCount > 0) {
            mesh.computeBoundingSphere();
          }
        }
      }
    }

    this.visibilityDirty = false;
  }

  private getHorizontalCameraDistance(instance: VegetationInstance): number {
    const dx = instance.x - this.lastVisibilityCameraPosition.x;
    const dz = instance.z - this.lastVisibilityCameraPosition.z;
    return Math.hypot(dx, dz);
  }

  private resolveLodLevel(model: LoadedVegetationModel, distanceMeters: number): LoadedVegetationModelLevel {
    let selected = model.levels[0];
    for (const level of model.levels) {
      if (distanceMeters >= level.config.startDistanceMeters) {
        selected = level;
      }
    }
    return selected;
  }

  private getRenderBatch(modelId: string, levelIndex: number, castsShadow: boolean): VegetationRenderBatch | null {
    return this.modelBatches.get(modelId)?.find((batch) => (
      batch.levelIndex === levelIndex && batch.castsShadow === castsShadow
    )) ?? null;
  }

  private writeInstanceMatrix(
    level: LoadedVegetationModelLevel,
    template: ModelMeshTemplate | undefined,
    instance: VegetationInstance,
    mesh: InstancedMesh,
    index: number,
  ): void {
    if (!template) return;

    const model = this.loadedModels.get(instance.modelId);
    const normalizedScale = (model?.definition.targetHeightMeters ?? 1) / level.sourceHeightMeters;
    const scalar = normalizedScale * (model?.definition.baseScale ?? 1) * instance.scale;

    this.position.set(instance.x, instance.y, instance.z);
    this.rotation.setFromAxisAngle(Y_AXIS, instance.rotationY);
    this.scale.setScalar(scalar);
    this.rootMatrix.compose(this.position, this.rotation, this.scale);
    // EN: Offset by the source model floor before scaling so very large or tiny downloaded assets sit on terrain.
    // 中文: 缩放前按源模型底部做偏移，让过大或过小的下载资产都能贴住地形。
    this.offsetMatrix.makeTranslation(0, -level.sourceMinY, 0);
    this.baseMatrix.multiplyMatrices(this.rootMatrix, this.offsetMatrix);
    this.finalMatrix.multiplyMatrices(this.baseMatrix, template.localMatrix);
    mesh.setMatrixAt(index, this.finalMatrix);
  }

  private clearRenderedMeshes(): void {
    for (const batches of this.modelBatches.values()) {
      for (const batch of batches) {
        for (const mesh of batch.meshes) {
          mesh.removeFromParent();
        }
      }
    }
    this.modelBatches.clear();
  }

  private disposeUnusedModels(data: VegetationMapData): void {
    const activeIds = new Set(Object.keys(data.models));
    for (const [modelId, model] of this.loadedModels) {
      if (activeIds.has(modelId)) continue;

      this.disposeLoadedModel(model);
      this.loadedModels.delete(modelId);
    }
  }

  private disposeLoadedModel(model: LoadedVegetationModel): void {
    for (const level of model.levels) {
      level.root.traverse((object) => {
        if (!isMeshObject(object)) return;
        object.geometry.dispose();
        disposeMaterial(object.material);
      });
    }
  }

  private notifyChanged(): void {
    for (const subscriber of this.changeSubscribers) {
      subscriber();
    }
  }
}