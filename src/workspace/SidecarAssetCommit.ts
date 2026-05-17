// SidecarAssetCommit: manifest-last commit protocol for region-pack based assets.
// SidecarAssetCommit：基于 region pack 的资产清单最后提交协议。

import { uint8ArrayToBase64 } from "@/lib/base64";
import { getPlatform } from "@/platform";

const platform = getPlatform();

export interface SidecarRegionPayload {
  key: string;
  path: string;
  bytes: Uint8Array;
}

interface CommitSidecarAssetOptions {
  mapDirectory: string;
  manifestPath: string;
  manifestText: string;
  regions: readonly SidecarRegionPayload[];
  staleRegionPaths?: Iterable<string>;
  staleDeleteLabel: string;
}

export async function writeSidecarRegionPacks(
  mapDirectory: string,
  regions: readonly SidecarRegionPayload[],
): Promise<void> {
  await Promise.all(regions.map(async (region) => {
    await platform.files.writeBinaryBase64(`${mapDirectory}/${region.path}`, uint8ArrayToBase64(region.bytes));
  }));
}

export async function commitSidecarAsset(options: CommitSidecarAssetOptions): Promise<void> {
  // EN: Binary packs are committed before the JSON manifest; stale packs are deleted only after the manifest is durable.
  // 中文: 二进制 pack 先于 JSON 清单提交；旧 pack 只在清单持久化后删除。
  await writeSidecarRegionPacks(options.mapDirectory, options.regions);
  await platform.files.writeText(`${options.mapDirectory}/${options.manifestPath}`, options.manifestText);

  if (!options.staleRegionPaths) {
    return;
  }

  const nextRegionPaths = new Set(options.regions.map((region) => region.path));
  await deleteStaleSidecarRegions(
    options.mapDirectory,
    options.staleRegionPaths,
    nextRegionPaths,
    options.staleDeleteLabel,
  );
}

async function deleteStaleSidecarRegions(
  mapDirectory: string,
  staleRegionPaths: Iterable<string>,
  nextRegionPaths: ReadonlySet<string>,
  label: string,
): Promise<void> {
  await Promise.all(Array.from(staleRegionPaths).map(async (path) => {
    if (nextRegionPaths.has(path)) {
      return;
    }

    try {
      await platform.files.deleteFile(`${mapDirectory}/${path}`);
    } catch (error) {
      console.warn(`[SidecarAssetCommit] Failed to delete stale ${label}: ${path}`, error);
    }
  }));
}