import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const directory = path.join(root, "artifacts/api-server");
const configPath = path.join(directory, "tsconfig.json");
const config = ts.readConfigFile(configPath, ts.sys.readFile);
assert.equal(config.error, undefined, "The API TypeScript configuration must parse.");
const raw = config.config;

// Mirror @vercel/node's per-file compiler configuration, including its handling
// of direct (not inherited) options. See packages/node/src/typescript.ts in
// vercel/vercel. This check emits only into memory; it never starts the app.
raw.files = [];
raw.include = [];
raw.compilerOptions = {
  ...raw.compilerOptions,
  sourceMap: true,
  inlineSourceMap: false,
  inlineSources: true,
  declaration: false,
  noEmit: false,
  outDir: "$$ts-node$$",
};
for (const key of [
  "out", "outFile", "composite", "declarationDir", "declarationMap",
  "emitDeclarationOnly", "tsBuildInfoFile", "incremental",
]) delete raw.compilerOptions[key];
raw.compilerOptions.target ??= "ES2021";
if (raw.compilerOptions.module === undefined) {
  Object.assign(raw.compilerOptions, {
    module: "NodeNext", moduleResolution: "NodeNext", strict: false,
  });
}
const parsed = ts.parseJsonConfigFileContent(raw, ts.sys, directory, undefined, configPath);
const versions = new Map();
const contents = new Map();
const host = {
  getScriptFileNames: () => [...versions.keys()],
  getScriptVersion: (file) => String(versions.get(file) ?? ""),
  getScriptSnapshot(file) {
    const source = contents.get(file) ?? ts.sys.readFile(file);
    if (source === undefined) return undefined;
    contents.set(file, source);
    versions.set(file, 1);
    return ts.ScriptSnapshot.fromString(source);
  },
  fileExists: ts.sys.fileExists,
  readFile: ts.sys.readFile,
  readDirectory: ts.sys.readDirectory,
  getDirectories: ts.sys.getDirectories,
  directoryExists: ts.sys.directoryExists,
  useCaseSensitiveFileNames: () => ts.sys.useCaseSensitiveFileNames,
  getCurrentDirectory: () => directory,
  getCompilationSettings: () => parsed.options,
  getDefaultLibFileName: () => ts.getDefaultLibFilePath(parsed.options),
  // The Vercel Express preset enables this resolver with its strict
  // TypeScript-errors flag; the default language-service resolver differs.
  resolveModuleNames: (names, containingFile) => names.map((name) =>
    ts.resolveModuleName(name, containingFile, parsed.options, ts.sys).resolvedModule),
};
const service = ts.createLanguageService(host);
const diagnosticHost = {
  getCurrentDirectory: () => directory,
  getCanonicalFileName: (file) => file,
  getNewLine: () => "\n",
};
try {
  for (const entry of ["src/routes/health.ts", "src/app.ts", "src/index.ts"]) {
    const file = path.join(directory, entry);
    contents.set(file, ts.sys.readFile(file));
    versions.set(file, 1);
    const output = service.getEmitOutput(file);
    const errors = ts.getPreEmitDiagnostics(service.getProgram())
      .filter((diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error);
    if (errors.length) {
      throw new Error(ts.formatDiagnosticsWithColorAndContext(errors, diagnosticHost));
    }
    assert.equal(output.emitSkipped, false, `${entry}: Emit skipped`);
    assert(output.outputFiles.some((result) => result.name.endsWith(".js")),
      `${entry}: No JavaScript output`);
    console.log(`TypeScript ${ts.version}: ${entry} emitted JavaScript successfully.`);
  }
} finally {
  service.dispose();
}
