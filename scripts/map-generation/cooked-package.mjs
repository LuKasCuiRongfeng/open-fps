import { copyFile, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  cookedBlobDirectory,
  cookedPackageLayout,
  createSha256Hex,
} from "./shared.mjs";

export function createCookedPackageBuilder(context) {
  const artifacts = new Map();

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

    createPackage() {
      const entries = [...artifacts.entries()].sort(([left], [right]) => left.localeCompare(right));
      return {
        layout: cookedPackageLayout,
        blobRoot: cookedBlobDirectory,
        artifactCount: entries.length,
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

function createBlobPath(runtimePath, sha256) {
  const extension = path.extname(runtimePath).replace(/[^.a-z0-9]/gi, "");
  return `${cookedBlobDirectory}/${sha256.slice(0, 2)}/${sha256}${extension}`;
}

function projectRelativePath(filePath, context) {
  return path.relative(context.projectDir, filePath).replaceAll(path.sep, "/");
}
