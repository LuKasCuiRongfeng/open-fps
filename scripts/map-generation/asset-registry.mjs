import path from "node:path";
import { readJsonFile } from "./shared.mjs";

export const assetRegistryPath = "assets/registry.json";
const materialTextureFields = ["diffuse", "normal", "arm", "displacement"];

export async function readAssetRegistry(context) {
  const registry = await readJsonFile(path.join(context.projectDir, assetRegistryPath));
  if (!registry || registry.format !== "open-fps-asset-registry-v1") {
    throw new Error(`Project asset registry '${assetRegistryPath}' is missing or invalid`);
  }

  return registry;
}

export function createTerrainPaintLayers(assetRegistry) {
  const entries = getRegistryAssets(assetRegistry)
    .filter((asset) => asset.type === "material" && asset.usage?.terrainLayer)
    .sort((left, right) => (left.usage.terrainLayer.order ?? 0) - (right.usage.terrainLayer.order ?? 0));

  return Object.fromEntries(entries.map((asset) => {
    const terrainLayer = asset.usage.terrainLayer;
    const layer = {
      name: terrainLayer.name,
      scale: terrainLayer.scale,
      splatMapIndex: terrainLayer.splatMapIndex,
    };

    for (const field of materialTextureFields) {
      layer[field] = getImportedFile(asset, field);
    }

    return [terrainLayer.key, layer];
  }));
}

export function createVegetationModelDefinitions(assetRegistry) {
  const entries = getRegistryAssets(assetRegistry)
    .filter((asset) => asset.type === "model" && asset.usage?.vegetationModel)
    .sort((left, right) => left.usage.vegetationModel.key.localeCompare(right.usage.vegetationModel.key));

  return Object.fromEntries(entries.map((asset) => {
    const vegetationModel = asset.usage.vegetationModel;
    const model = {
      id: vegetationModel.key,
      name: vegetationModel.name,
      path: toMapRelativeAssetPath(getImportedFile(asset, "primary")),
      lod1Path: toMapRelativeAssetPath(getImportedFile(asset, "lod1")),
      lod1DistanceMeters: vegetationModel.lod1DistanceMeters,
      lod2Path: toMapRelativeAssetPath(getImportedFile(asset, "lod2")),
      lod2DistanceMeters: vegetationModel.lod2DistanceMeters,
      targetHeightMeters: vegetationModel.targetHeightMeters,
      baseScale: vegetationModel.baseScale,
      castShadow: true,
      receiveShadow: true,
      maxVisibleDistanceMeters: vegetationModel.maxVisibleDistanceMeters,
      shadowDistanceMeters: vegetationModel.shadowDistanceMeters,
    };

    return [vegetationModel.key, model];
  }));
}

export function getWorldObjectModelPath(assetRegistry, assetName) {
  return toMapRelativeAssetPath(getImportedFile(getAsset(assetRegistry, `polyhaven:model:${assetName}`, "model"), "primary"));
}

function getRegistryAssets(assetRegistry) {
  return Object.values(assetRegistry.assets ?? {});
}

function getAsset(assetRegistry, assetId, expectedType) {
  const asset = assetRegistry.assets?.[assetId];
  if (!asset || asset.type !== expectedType) {
    throw new Error(`Asset registry is missing ${expectedType} asset '${assetId}'`);
  }

  return asset;
}

function getImportedFile(asset, role) {
  const value = asset.imported?.files?.[role];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Asset '${asset.id}' is missing imported file role '${role}'`);
  }

  return value;
}

function toMapRelativeAssetPath(projectRelativePath) {
  return `../../${projectRelativePath}`;
}