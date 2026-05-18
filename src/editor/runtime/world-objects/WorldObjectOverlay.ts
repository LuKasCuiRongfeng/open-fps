// WorldObjectOverlay: source world object visualization for the editor.
// WorldObjectOverlay：编辑器中的 source 世界对象可视化。

import {
  BoxGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshBasicNodeMaterial,
  type Object3D,
  type Scene,
} from "three/webgpu";
import { color } from "three/tsl";
import { getPlatform } from "@/platform";
import { formatUnknownError, isMissingFileSystemResourceError } from "@/platform/errorUtils";
import type { MapData } from "@project/MapData";
import {
  WorldObjectGltfModelLibrary,
  isGltfWorldObjectArchetype,
  objectRadiusFromBounds,
  type WorldObjectArchetypeDefinition,
  type WorldObjectCellPack,
  type WorldObjectCellRef,
  type WorldObjectEntry,
  type WorldObjectManifest,
} from "@game/world/objects";

const WORLD_OBJECTS_PATH = "objects/manifest.json";
const ROAD_RIBBON_HEIGHT_METERS = 0.45;
const WATER_RIBBON_HEIGHT_METERS = 0.22;
const SURFACE_OFFSET_METERS = 0.75;
const MARKER_HEIGHT_METERS = 18;
const MARKER_RADIUS_METERS = 7;
const RIBBON_CHUNK_LENGTH_METERS = 96;

const platform = getPlatform();

type WorldObjectTerrainAvailability = (xMeters: number, zMeters: number) => boolean;

type WorldObjectOverlayEntry = {
  object: Object3D;
  sampleX: number;
  sampleZ: number;
};

export class WorldObjectOverlay {
  private readonly root = new Group();
  private readonly ribbonGeometry = new BoxGeometry(1, 1, 1);
  private readonly markerGeometry = new CylinderGeometry(1, 1, 1, 12, 1, false);
  private readonly roadMaterial = createMaterial(0.95, 0.62, 0.28, 0.78);
  private readonly waterMaterial = createMaterial(0.24, 0.68, 1.0, 0.72);
  private readonly poiMaterial = createMaterial(1.0, 0.82, 0.22, 0.92);
  private readonly propMaterial = createMaterial(0.9, 0.92, 0.96, 0.82);
  private readonly modelLibrary = new WorldObjectGltfModelLibrary();
  private readonly entries: WorldObjectOverlayEntry[] = [];
  private archetypes: Record<string, WorldObjectArchetypeDefinition> = {};
  private assetBaseDirectory = "";
  private revision = 0;
  private terrainAvailability: WorldObjectTerrainAvailability | null = null;
  private scene: Scene | null = null;

  constructor() {
    this.root.name = "world-object-overlay";
    this.root.renderOrder = 120;
  }

  attach(scene: Scene): void {
    if (this.scene === scene) {
      return;
    }

    this.detach();
    this.scene = scene;
    scene.add(this.root);
  }

  detach(): void {
    if (!this.scene) {
      return;
    }

    this.scene.remove(this.root);
    this.scene = null;
  }

  async loadFromMapDirectory(mapDirectory: string, mapData?: MapData | null): Promise<void> {
    this.clear();
    this.assetBaseDirectory = mapDirectory;
    const manifestPath = joinPath(mapDirectory, mapData?.objectsPath ?? WORLD_OBJECTS_PATH);
    let manifestText: string;
    try {
      manifestText = await platform.files.readText(manifestPath);
    } catch (error) {
      if (isMissingFileSystemResourceError(error)) {
        console.warn(`[WorldObjectOverlay] World object manifest not found: ${manifestPath}`, error);
        return;
      }

      console.error(`[WorldObjectOverlay] Failed to load world object manifest: ${formatUnknownError(error)}`, error);
      throw error;
    }

    const manifest = parseWorldObjectManifest(manifestText, manifestPath);
    const packs = await Promise.all(
      Object.entries(manifest.cells).map(async ([key, cell]) => [key, await this.loadCellPack(mapDirectory, cell)] as const),
    );

    this.setLoadedData(mapDirectory, manifest, new Map(packs));
  }

  setLoadedData(
    mapDirectory: string,
    manifest: WorldObjectManifest,
    packsByCell: ReadonlyMap<string, WorldObjectCellPack>,
  ): void {
    this.clear();
    this.assetBaseDirectory = mapDirectory;
    this.archetypes = manifest.archetypes ?? {};
    this.revision += 1;
    const revision = this.revision;

    for (const object of Array.from(packsByCell.values()).flatMap((pack) => pack.objects)) {
      this.addObject(object);
    }
    this.updateTerrainVisibility();
    if (revision !== this.revision) {
      this.clear();
    }
  }

  setTerrainAvailability(predicate: WorldObjectTerrainAvailability | null): void {
    this.terrainAvailability = predicate;
    this.updateTerrainVisibility();
  }

  updateTerrainVisibility(): void {
    for (const entry of this.entries) {
      entry.object.visible = this.terrainAvailability?.(entry.sampleX, entry.sampleZ) ?? true;
    }
  }

  dispose(): void {
    this.detach();
    this.clear();
    this.ribbonGeometry.dispose();
    this.markerGeometry.dispose();
    this.roadMaterial.dispose();
    this.waterMaterial.dispose();
    this.poiMaterial.dispose();
    this.propMaterial.dispose();
    this.modelLibrary.dispose();
  }

  private async loadCellPack(mapDirectory: string, cell: WorldObjectCellRef): Promise<WorldObjectCellPack> {
    const cellPath = joinPath(mapDirectory, cell.path);
    const pack = parseWorldObjectCellPack(await platform.files.readText(cellPath), cellPath);
    if (pack.objects.length !== cell.objectCount) {
      throw new Error(`World object cell '${cell.path}' object count is stale`);
    }

    return pack;
  }

  private clear(): void {
    while (this.root.children.length > 0) {
      this.root.remove(this.root.children[0]);
    }
    this.entries.length = 0;
  }

  private addObject(object: WorldObjectEntry): void {
    if (object.layer === "road" || object.layer === "water") {
      this.addRibbonObject(object);
      return;
    }

    const archetype = this.archetypes[object.archetype];
    if (isGltfWorldObjectArchetype(archetype) && this.assetBaseDirectory) {
      this.addModelObject(object, archetype);
      return;
    }

    this.addMarkerObject(object);
  }

  private addModelObject(
    object: WorldObjectEntry,
    archetype: WorldObjectArchetypeDefinition & { render: NonNullable<WorldObjectArchetypeDefinition["render"]> & { path: string } },
  ): void {
    const revision = this.revision;
    void this.modelLibrary.loadModel(this.assetBaseDirectory, archetype.render)
      .then((model) => {
        if (revision !== this.revision) {
          return;
        }

        const modelObject = this.modelLibrary.createInstance(model, archetype.render, object);
        modelObject.name = `world-object-model-${object.layer}-${object.id}`;
        modelObject.renderOrder = this.root.renderOrder;
        this.root.add(modelObject);
        this.entries.push({ object: modelObject, sampleX: object.position.x, sampleZ: object.position.z });
        this.updateTerrainVisibility();
      })
      .catch((error: unknown) => {
        console.warn(`[WorldObjectOverlay] Failed to load model for '${object.archetype}'`, error);
        if (revision === this.revision) {
          this.addMarkerObject(object);
        }
      });
  }

  private addRibbonObject(object: WorldObjectEntry): void {
    const widthMeters = Math.max(3, object.spline?.widthMeters ?? objectRadiusFromBounds(object) * 0.5);
    const points = object.spline?.points;
    if (!points || points.length < 2) {
      this.addRibbonChunk(object, object.position.x, object.position.y, object.position.z, object.rotationY ?? 0, Math.max(widthMeters, objectRadiusFromBounds(object) * 2), widthMeters, 0);
      return;
    }

    let chunkIndex = 0;
    for (let pointIndex = 0; pointIndex < points.length - 1; pointIndex += 1) {
      const start = points[pointIndex];
      const end = points[pointIndex + 1];
      const segmentLength = Math.hypot(end.x - start.x, end.z - start.z);
      const chunkCount = Math.max(1, Math.ceil(segmentLength / RIBBON_CHUNK_LENGTH_METERS));
      for (let index = 0; index < chunkCount; index += 1) {
        const t0 = index / chunkCount;
        const t1 = (index + 1) / chunkCount;
        const centerT = (t0 + t1) * 0.5;
        const centerX = start.x + (end.x - start.x) * centerT;
        const centerZ = start.z + (end.z - start.z) * centerT;
        const centerY = object.position.y;
        const rotationY = Math.atan2(end.x - start.x, end.z - start.z);
        this.addRibbonChunk(object, centerX, centerY, centerZ, rotationY, segmentLength / chunkCount, widthMeters, chunkIndex);
        chunkIndex += 1;
      }
    }
  }

  private addRibbonChunk(
    object: WorldObjectEntry,
    x: number,
    y: number,
    z: number,
    rotationY: number,
    lengthMeters: number,
    widthMeters: number,
    chunkIndex: number,
  ): void {
    const mesh = new Mesh(this.ribbonGeometry, object.layer === "water" ? this.waterMaterial : this.roadMaterial);
    const heightMeters = object.layer === "water" ? WATER_RIBBON_HEIGHT_METERS : ROAD_RIBBON_HEIGHT_METERS;

    mesh.name = `world-object-${object.layer}-${object.id}-${chunkIndex}`;
    mesh.position.set(x, y + SURFACE_OFFSET_METERS, z);
    mesh.rotation.y = rotationY;
    mesh.scale.set(widthMeters, heightMeters, lengthMeters);
    mesh.frustumCulled = false;
    mesh.renderOrder = this.root.renderOrder;
    this.root.add(mesh);
    this.entries.push({ object: mesh, sampleX: x, sampleZ: z });
  }

  private addMarkerObject(object: WorldObjectEntry): void {
    const mesh = new Mesh(this.markerGeometry, object.layer === "poi" ? this.poiMaterial : this.propMaterial);
    const markerRadius = Math.max(3, Math.min(MARKER_RADIUS_METERS, object.radiusMeters ?? objectRadiusFromBounds(object) * 0.25));
    const markerHeight = object.layer === "poi" ? MARKER_HEIGHT_METERS : MARKER_HEIGHT_METERS * 0.55;

    mesh.name = `world-object-${object.layer}-${object.id}`;
    mesh.position.set(object.position.x, object.position.y + markerHeight * 0.5 + SURFACE_OFFSET_METERS, object.position.z);
    mesh.scale.set(markerRadius, markerHeight, markerRadius);
    mesh.frustumCulled = false;
    mesh.renderOrder = this.root.renderOrder;
    this.root.add(mesh);
    this.entries.push({ object: mesh, sampleX: object.position.x, sampleZ: object.position.z });
  }
}

function createMaterial(red: number, green: number, blue: number, opacity: number): MeshBasicNodeMaterial {
  const material = new MeshBasicNodeMaterial();
  material.colorNode = color(red, green, blue);
  material.transparent = true;
  material.opacity = opacity;
  material.depthWrite = false;
  material.depthTest = true;
  material.fog = false;
  return material;
}

export function parseWorldObjectManifest(json: string, label: string): WorldObjectManifest {
  const parsed = JSON.parse(json) as unknown;
  if (!isRecord(parsed) || !isRecord(parsed.cells)) {
    throw new Error(`World object manifest '${label}' is invalid`);
  }

  const cells: Record<string, WorldObjectCellRef> = {};
  for (const [key, value] of Object.entries(parsed.cells)) {
    const cell = readRecord(value, `world object cell '${key}'`);
    cells[key] = {
      path: readString(cell.path, `world object cell '${key}' path`),
      objectCount: readNonNegativeInteger(cell.objectCount, `world object cell '${key}' objectCount`),
    };
  }

  return {
    version: readOptionalFiniteNumber(parsed.version, `${label} version`),
    format: readOptionalString(parsed.format, `${label} format`),
    cellFormat: readOptionalString(parsed.cellFormat, `${label} cellFormat`),
    cellSizePages: readOptionalFiniteNumber(parsed.cellSizePages, `${label} cellSizePages`),
    cellSizeMeters: readOptionalFiniteNumber(parsed.cellSizeMeters, `${label} cellSizeMeters`),
    cellsDirectory: readOptionalString(parsed.cellsDirectory, `${label} cellsDirectory`),
    designSource: readOptionalString(parsed.designSource, `${label} designSource`),
    archetypes: isRecord(parsed.archetypes)
      ? parsed.archetypes as Record<string, WorldObjectArchetypeDefinition>
      : undefined,
    cells,
  };
}

export function parseWorldObjectCellPack(json: string, label: string): WorldObjectCellPack {
  const parsed = JSON.parse(json) as unknown;
  if (!isRecord(parsed) || !Array.isArray(parsed.objects)) {
    throw new Error(`World object cell pack '${label}' is invalid`);
  }

  return {
    version: readOptionalFiniteNumber(parsed.version, `${label} version`),
    format: readOptionalString(parsed.format, `${label} format`),
    cell: isRecord(parsed.cell)
      ? {
        key: readString(parsed.cell.key, `${label} cell.key`),
        x: readOptionalFiniteNumber(parsed.cell.x, `${label} cell.x`) ?? 0,
        z: readOptionalFiniteNumber(parsed.cell.z, `${label} cell.z`) ?? 0,
        pageRect: isRecord(parsed.cell.pageRect) ? {
          minX: readFiniteNumber(parsed.cell.pageRect.minX, `${label} cell.pageRect.minX`),
          maxX: readFiniteNumber(parsed.cell.pageRect.maxX, `${label} cell.pageRect.maxX`),
          minZ: readFiniteNumber(parsed.cell.pageRect.minZ, `${label} cell.pageRect.minZ`),
          maxZ: readFiniteNumber(parsed.cell.pageRect.maxZ, `${label} cell.pageRect.maxZ`),
        } : undefined,
        boundsMeters: readOptionalBounds(parsed.cell.boundsMeters, `${label} cell.boundsMeters`),
      }
      : undefined,
    objects: parsed.objects.map((object, index) => normalizeWorldObject(object, `${label} object ${index}`)),
  };
}

function normalizeWorldObject(value: unknown, label: string): WorldObjectEntry {
  const object = readRecord(value, label);
  return {
    id: readString(object.id, `${label} id`),
    layer: readString(object.layer, `${label} layer`),
    archetype: readString(object.archetype, `${label} archetype`),
    position: readPosition(object.position, `${label} position`),
    rotationY: readOptionalFiniteNumber(object.rotationY, `${label} rotationY`),
    radiusMeters: readOptionalFiniteNumber(object.radiusMeters, `${label} radiusMeters`),
    boundsMeters: readOptionalBounds(object.boundsMeters, `${label} boundsMeters`),
    spline: readOptionalSpline(object.spline, `${label} spline`),
  };
}

function readPosition(value: unknown, label: string): WorldObjectEntry["position"] {
  const position = readRecord(value, label);
  return {
    x: readFiniteNumber(position.x, `${label}.x`),
    y: readFiniteNumber(position.y, `${label}.y`),
    z: readFiniteNumber(position.z, `${label}.z`),
  };
}

function readOptionalBounds(value: unknown, label: string): WorldObjectEntry["boundsMeters"] {
  if (value === undefined) {
    return undefined;
  }

  const bounds = readRecord(value, label);
  return {
    minX: readFiniteNumber(bounds.minX, `${label}.minX`),
    minZ: readFiniteNumber(bounds.minZ, `${label}.minZ`),
    maxX: readFiniteNumber(bounds.maxX, `${label}.maxX`),
    maxZ: readFiniteNumber(bounds.maxZ, `${label}.maxZ`),
  };
}

function readOptionalSpline(value: unknown, label: string): WorldObjectEntry["spline"] {
  if (value === undefined) {
    return undefined;
  }

  const spline = readRecord(value, label);
  const points = Array.isArray(spline.points)
    ? spline.points.map((point, index) => {
      const record = readRecord(point, `${label}.points[${index}]`);
      return {
        x: readFiniteNumber(record.x, `${label}.points[${index}].x`),
        z: readFiniteNumber(record.z, `${label}.points[${index}].z`),
      };
    })
    : undefined;

  return {
    widthMeters: readOptionalFiniteNumber(spline.widthMeters, `${label}.widthMeters`),
    points,
  };
}

function readRecord(value: unknown, label: string): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new Error(`${label} must be a JSON object`);
  }

  return value;
}

function readString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${label} must be a non-empty string`);
  }

  return value;
}

function readOptionalString(value: unknown, label: string): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  return readString(value, label);
}

function readFiniteNumber(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${label} must be a finite number`);
  }

  return value;
}

function readOptionalFiniteNumber(value: unknown, label: string): number | undefined {
  if (value === undefined) {
    return undefined;
  }

  return readFiniteNumber(value, label);
}

function readNonNegativeInteger(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative integer`);
  }

  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function joinPath(directory: string, relativePath: string): string {
  return `${directory.replace(/[\\/]$/, "")}/${relativePath}`;
}
