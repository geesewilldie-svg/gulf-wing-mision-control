// Trusted compiler worker. Candidate source is parsed/type-checked as data;
// it is never imported, emitted, evaluated, installed or executed.
import { parentPort, workerData } from "node:worker_threads";
import { createRequire } from "node:module";
import path from "node:path";
const require = createRequire(path.join(workerData.appRoot, "package.json"));
const ts = require("typescript");
const root = path.join(workerData.appRoot, "__nexus_virtual_candidate__");
const canonical = (p) => {
  const v = path.resolve(p).replaceAll("\\", "/");
  return process.platform === "win32" ? v.toLowerCase() : v;
};
const roots = [
  path.join(workerData.appRoot, "node_modules/typescript/lib"),
  path.join(workerData.appRoot, "node_modules/@types/node"),
  path.join(workerData.appRoot, "node_modules/undici-types"),
].map(canonical);
const inside = (p, r) => p === r || p.startsWith(r + "/");
const virtual = new Map(
  workerData.candidate.files.map((f) => [
    canonical(path.join(root, f.path)),
    f.content,
  ]),
);
const read = (file) => {
  const p = canonical(file);
  if (virtual.has(p)) return virtual.get(p);
  if (roots.some((r) => inside(p, r))) return ts.sys.readFile(file);
  return undefined;
};
const host = ts.createCompilerHost({});
host.readFile = read;
host.fileExists = (file) => {
  const p = canonical(file);
  return (
    virtual.has(p) ||
    (roots.some((r) => inside(p, r)) && ts.sys.fileExists(file))
  );
};
host.directoryExists = (dir) => {
  const p = canonical(dir);
  return (
    [...virtual.keys()].some((f) => f.startsWith(p + "/")) ||
    roots.some(
      (r) =>
        (inside(p, r) && ts.sys.directoryExists(dir)) || r.startsWith(p + "/"),
    )
  );
};
host.getDirectories = (dir) => {
  const p = canonical(dir);
  if (roots.some((r) => inside(p, r))) return ts.sys.getDirectories(dir);
  return [
    ...new Set(
      [...virtual.keys(), ...roots]
        .filter((f) => f.startsWith(p + "/"))
        .map((f) => path.join(dir, f.slice(p.length + 1).split("/")[0])),
    ),
  ];
};
host.realpath = (p) => path.resolve(p);
host.getCurrentDirectory = () => root;
host.getSourceFile = (file, languageVersion) => {
  const source = read(file);
  return source === undefined
    ? undefined
    : ts.createSourceFile(file, source, languageVersion, true);
};
host.writeFile = () => {
  throw Error("Candidate emit is disabled.");
};
const options = {
  strict: true,
  noEmit: true,
  noEmitOnError: true,
  skipLibCheck: true,
  target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.NodeNext,
  moduleResolution: ts.ModuleResolutionKind.NodeNext,
  types: ["node"],
  typeRoots: [path.join(workerData.appRoot, "node_modules/@types")],
  esModuleInterop: true,
  jsx: ts.JsxEmit.ReactJSX,
};
const files = workerData.candidate.files.filter((f) => /\.tsx?$/.test(f.path));
const risks = new Set();
for (const f of files) {
  const ast = ts.createSourceFile(
    f.path,
    f.content,
    ts.ScriptTarget.Latest,
    true,
  );
  const visit = (n) => {
    if (ts.isImportDeclaration(n) || ts.isExportDeclaration(n)) {
      if (n.moduleSpecifier && ts.isStringLiteral(n.moduleSpecifier))
        inspectModule(n.moduleSpecifier.text);
    }
    if (ts.isCallExpression(n)) {
      if (
        n.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(n.expression) && n.expression.text === "require")
      ) {
        const a = n.arguments[0];
        if (a && ts.isStringLiteral(a)) inspectModule(a.text);
        else risks.add("Dynamic module loading requires review.");
      }
      if (
        ts.isIdentifier(n.expression) &&
        ["eval", "Function"].includes(n.expression.text)
      )
        risks.add("Dynamic code construction requires review.");
    }
    ts.forEachChild(n, visit);
  };
  visit(ast);
}
function inspectModule(name) {
  if (
    /^(node:)?(fs|child_process|http|https|net|tls|dgram|worker_threads|vm|module|process)(\/|$)/.test(
      name,
    )
  )
    risks.add("Host capability reference: " + name);
  else if (!name.startsWith(".") && !name.startsWith("node:"))
    risks.add("External/absolute module reference: " + name);
}
let diagnostics = [];
if (files.length) {
  const program = ts.createProgram(
    files.map((f) => path.join(root, f.path)),
    options,
    host,
  );
  diagnostics = ts
    .getPreEmitDiagnostics(program)
    .slice(0, 30)
    .map((d) => ({
      code: d.code,
      file: d.file
        ? path.relative(root, d.file.fileName).replaceAll("\\", "/")
        : null,
      line:
        d.file && d.start !== undefined
          ? d.file.getLineAndCharacterOfPosition(d.start).line + 1
          : null,
      message: ts
        .flattenDiagnosticMessageText(d.messageText, " ")
        .slice(0, 500),
    }));
}
for (const f of workerData.candidate.files.filter((f) =>
  f.path.endsWith(".json"),
)) {
  try {
    JSON.parse(f.content);
  } catch {
    diagnostics.push({
      code: 0,
      file: f.path,
      line: null,
      message: "Candidate JSON is invalid.",
    });
  }
}
parentPort.postMessage({
  validator: "typescript-node-v1",
  compilerVersion: ts.version,
  typecheck: files.length
    ? diagnostics.length
      ? "failed"
      : "passed"
    : "not-applicable",
  diagnostics,
  risks: [...risks].slice(0, 20),
  testFiles: workerData.candidate.files
    .filter((f) => /^(tests\/)|\.(test|spec)\.tsx?$/.test(f.path))
    .map((f) => f.path),
  tests: "not-run",
  codeExecution: "not-run",
  installation: "not-performed",
  limitations: [
    "Static checks do not establish correctness, safety or test results.",
    "Only candidate files and installed TypeScript/Node declaration libraries are available; external packages are not installed.",
  ],
});
