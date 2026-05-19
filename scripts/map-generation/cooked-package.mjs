import { copyFile, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { brotliCompress, constants as zlibConstants } from "node:zlib";
import {
  cookedBlobDirectory,
  cookedPackageLayout,
  createSha256Hex,
} from "./shared.mjs";

const brotliCompressAsync = promisify(brotliCompress);
const compressedBlobDirectory = "cooked/blobs/brotli";
const kindOrder = new Map([
  ["metadata", 0],
  ["terrain", 10],
  ["paint", 20],
  ["vegetation", 30],
  ["objects", 40],
  ["collision", 50],
  ["nav", 60],
]);

export function createCookedPackageBuilder(context, seedPackage = null) {
  const artifacts = new Map(Object.entries(seedPackage?.artifacts ?? {}));

  return {
    async copyFile(sourcePath, runtimePath, kind, sourceRelativePath = null) {
      const targetPath = path.join(context.projectDir, runtimePath);
      await mkdir(path.dirname(targetPath), { recursive: true });
      await copyFile(sourcePath, targetPath);
      return this.addCopiedFile(runtimePath, kind, sourceRelativePath);
    },

    async writeGeneratedFile(runtimePath, bytes, kind, sourceRelativePath = null) {
      const targetPath = path.join(context.projectDir, runtimePath);
      await mkdir(path.dirname(targetPath), { recursive: true });
      await writeFile(targetPath, bytes);
      return addArtifact(runtimePath, bytes, kind, sourceRelativePath);
    },

    async addCopiedFile(runtimePath, kind, sourceRelativePath = null) {
      const bytes = await readFile(path.join(context.projectDir, runtimePath));
      return addArtifact(runtimePath, bytes, kind, sourceRelativePath);
    },

    async addCopiedTree(runtimeRootPath, kind, sourceRootPath = null) {
      const runtimeRoot = path.join(context.projectDir, runtimeRootPath);
      const files = await listFiles(runtimeRoot);
      await Promise.all(files.map(async (filePath) => {
        const runtimePath = projectRelativePath(filePath, context);
        const sourceRelativePath = sourceRootPath
          ? projectRelativePath(path.join(sourceRootPath, path.relative(runtimeRoot, filePath)), context)
          : null;
        await this.addCopiedFile(runtimePath, kind, sourceRelativePath);
      }));
    },

    async createPackage() {
      const hydratedEntries = await Promise.all([...artifacts.entries()].map(async ([runtimePath, artifact]) => {
        const hydrated = artifact.compression?.algorithm === "brotli" && artifact.compression?.blobPath
          ? artifact
          : await addCompressedSidecar(artifact);
        return [runtimePath, hydrated];
      }));
      const entries = hydratedEntries.sort(compareArtifactEntries);
      const stats = createPackageStats(entries.map(([, artifact]) => artifact));
      await pruneBlobRoots(context, entries.map(([, artifact]) => artifact));
      return {
        layout: cookedPackageLayout,
        blobRoot: cookedBlobDirectory,
        artifactCount: entries.length,
        streaming: {
          locality: "kind-cell-runtime-path-v2",
          duplicateBlobPolicy: "content-addressed-sha256",
          compression: "brotli-sidecar-v1",
          sort: "kind-cell-runtime-path-v2",
          compressedBlobRoot: compressedBlobDirectory,
          uncompressedBytes: stats.uncompressedBytes,
          compressedBytes: stats.compressedBytes,
          compressionRatio: stats.compressionRatio,
          duplicateArtifacts: stats.duplicateArtifacts,
          uniqueBlobCount: stats.uniqueBlobCount,
        },
        artifacts: Object.fromEntries(entries),
      };
    },
  };

  async function addArtifact(runtimePath, bytes, kind, sourceRelativePath) {
    const sha256 = createSha256Hex(bytes);
    const byteLength = bytes.byteLength;
    const blobPath = createBlobPath(runtimePath, sha256);
    const blobTargetPath = path.join(context.projectDir, blobPath);
    await mkdir(path.dirname(blobTargetPath), { recursive: true });
    await writeFile(blobTargetPath, bytes);

    const artifact = {
      path: runtimePath,
      blobPath,
      kind,
      byteLength,
      sha256,
    };
    if (sourceRelativePath) {
      artifact.sourcePath = sourceRelativePath;
    }

    artifacts.set(runtimePath, artifact);
    return artifact;
  }

  async function addCompressedSidecar(artifact) {
    const sourceBytes = await readFile(path.join(context.projectDir, artifact.blobPath));
    const compressedBytes = await brotliCompressAsync(sourceBytes, {
      params: {
        [zlibConstants.BROTLI_PARAM_QUALITY]: 7,
      },
    });
    const compressedSha256 = createSha256Hex(compressedBytes);
    const compressedBlobPath = createCompressedBlobPath(artifact.path, artifact.sha256);
    const targetPath = path.join(context.projectDir, compressedBlobPath);
    await mkdir(path.dirname(targetPath), { recursive: true });
    await writeFile(targetPath, compressedBytes);

    const nextArtifact = {
      ...artifact,
      compression: {
        algorithm: "brotli",
        blobPath: compressedBlobPath,
        byteLength: compressedBytes.byteLength,
        sha256: compressedSha256,
      },
    };
    artifacts.set(artifact.path, nextArtifact);
    return nextArtifact;
  }
}

function createPackageStats(artifacts) {
  const uniqueBlobHashes = new Set();
  const duplicateBlobHashes = new Set();
  let uncompressedBytes = 0;
  let compressedBytes = 0;

  for (const artifact of artifacts) {
    uncompressedBytes += artifact.byteLength;
    compressedBytes += artifact.compression?.byteLength ?? artifact.byteLength;
    if (uniqueBlobHashes.has(artifact.sha256)) {
      duplicateBlobHashes.add(artifact.sha256);
    }
    uniqueBlobHashes.add(artifact.sha256);
  }

  return {
    uncompressedBytes,
    compressedBytes,
    compressionRatio: uncompressedBytes > 0 ? Number((compressedBytes / uncompressedBytes).toFixed(4)) : 1,
    duplicateArtifacts: duplicateBlobHashes.size,
    uniqueBlobCount: uniqueBlobHashes.size,
  };
}

function compareArtifactEntries([leftPath, leftArtifact], [rightPath, rightArtifact]) {
  const leftKindOrder = kindOrder.get(leftArtifact.kind) ?? 100;
  const rightKindOrder = kindOrder.get(rightArtifact.kind) ?? 100;
  if (leftKindOrder !== rightKindOrder) {
    return leftKindOrder - rightKindOrder;
  }

  const leftCell = readCellCoordinates(leftPath);
  const rightCell = readCellCoordinates(rightPath);
  if (leftCell && rightCell) {
    return leftCell.z - rightCell.z || leftCell.x - rightCell.x || leftPath.localeCompare(rightPath);
  }

  if (leftCell) {
    return -1;
  }
  if (rightCell) {
    return 1;
  }

  return leftPath.localeCompare(rightPath);
}

function readCellCoordinates(runtimePath) {
  const match = /\/c_(-?\d+)_(-?\d+)\.[^.]+$/.exec(runtimePath);
  if (!match) {
    return null;
  }

  return { x: Number(match[1]), z: Number(match[2]) };
}

async function listFiles(directoryPath) {
  const entries = await readdir(directoryPath, { withFileTypes: true });
  const files = await Promise.all(entries.map(async (entry) => {
    const entryPath = path.join(directoryPath, entry.name);
    if (entry.isDirectory()) {
      return listFiles(entryPath);
    }
    if (entry.isFile()) {
      return [entryPath];
    }

    return [];
  }));

  return files.flat();
}

async function listFilesSafe(directoryPath) {
  try {
    return await listFiles(directoryPath);
  } catch (error) {
    if (error?.code === "ENOENT") {
      return [];
    }

    throw error;
  }
}

async function pruneBlobRoots(context, artifacts) {
  const used = new Set(artifacts.flatMap((artifact) => [artifact.blobPath, artifact.compression?.blobPath].filter(Boolean)));
  const roots = [cookedBlobDirectory, compressedBlobDirectory];
  for (const root of roots) {
    const rootPath = path.join(context.projectDir, root);
    const files = await listFilesSafe(rootPath);
    await Promise.all(files.map(async (filePath) => {
      const runtimePath = projectRelativePath(filePath, context);
      if (!used.has(runtimePath)) {
        await rm(filePath, { force: true });
      }
    }));
  }
}

function createBlobPath(runtimePath, sha256) {
  const extension = path.extname(runtimePath).replace(/[^.a-z0-9]/gi, "");
  return `${cookedBlobDirectory}/${sha256.slice(0, 2)}/${sha256}${extension}`;
}

function createCompressedBlobPath(runtimePath, sha256) {
  const extension = path.extname(runtimePath).replace(/[^.a-z0-9]/gi, "");
  return `${compressedBlobDirectory}/${sha256.slice(0, 2)}/${sha256}${extension}.br`;
}

function projectRelativePath(filePath, context) {
  return path.relative(context.projectDir, filePath).replaceAll(path.sep, "/");
}
