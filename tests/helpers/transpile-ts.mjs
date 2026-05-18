import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import * as ts from "typescript";

export async function transpileTsModule(sourcePath, outputDirectory, rewriteSource = (source) => source) {
  await mkdir(outputDirectory, { recursive: true });
  const source = rewriteSource(await readFile(sourcePath, "utf8"));
  const output = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ES2022,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      jsx: ts.JsxEmit.ReactJSX,
      verbatimModuleSyntax: false,
    },
    fileName: sourcePath,
  }).outputText;
  const outputPath = path.join(outputDirectory, path.basename(sourcePath).replace(/\.tsx?$/, ".js"));
  await writeFile(outputPath, output, "utf8");
  return outputPath;
}