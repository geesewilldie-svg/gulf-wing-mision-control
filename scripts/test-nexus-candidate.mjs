// Trusted host worker: candidate JS runs only inside QuickJS WebAssembly.
// No host objects, filesystem, network, process, timers or module loader escape.
import { parentPort, workerData } from "node:worker_threads";
import path from "node:path";
import ts from "typescript";
import { getQuickJS } from "quickjs-emscripten";
const files = new Map();
for (const f of workerData.candidate.files) {
  if (!f.path.endsWith(".ts") || f.path.endsWith(".d.ts")) continue;
  const emitted = ts.transpileModule(f.content, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
    },
    fileName: f.path,
  });
  files.set("/candidate/" + f.path.replace(/\.ts$/, ".js"), emitted.outputText);
}
const testFiles = [...files.keys()].filter(
  (p) => p.startsWith("/candidate/tests/") && /\.(test|spec)\.js$/.test(p),
);
if (!testFiles.length)
  throw Error("No supported tests/*.test.ts or *.spec.ts files found.");
const QuickJS = await getQuickJS();
const runtime = QuickJS.newRuntime();
runtime.setMemoryLimit(32 * 1024 * 1024);
runtime.setMaxStackSize(512 * 1024);
const deadline = Date.now() + 2000;
runtime.setInterruptHandler(() => Date.now() > deadline);
const vm = runtime.newContext();
const builtins = {
  "nexus:test": `
const create=Object.create;const results=create(null);let count=0; const stringify=JSON.stringify; const text=String;const slice=Function.prototype.call.bind(String.prototype.slice);
export function test(name, fn) {
 if(count>=50) throw Error("Test count exceeds 50");
 const row=create(null);row.name=slice(text(name),0,160);row.status="failed";row.detail="Test did not complete";results[count++]=row;
 try { if(typeof fn!=="function")throw Error("Only synchronous test(name, callback) is supported");
 const returned=fn(); if(returned && typeof returned.then==="function")throw Error("Async tests are unsupported");
 row.status="passed";row.detail="";
 }catch(e){row.detail=slice(text(e?.message || e),0,400);}
}
export default test;
export function report(){let output="[";for(let i=0;i<count;i++){const r=results[i];if(i)output+=",";output+='{'+ '"name":'+stringify(r.name)+',"status":'+stringify(r.status)+',"detail":'+stringify(r.detail)+'}';}return output+"]";}
`,
  "nexus:assert": `
function fail(message="Assertion failed"){throw Error(String(message));}
const same=Object.is;function equal(a,b,message){if(!same(a,b))fail(message || "Values are not strictly equal");}
function ok(value,message){if(!value)fail(message);}
function throws(fn,expected){let error;let caught=false;try{fn();}catch(e){error=e;caught=true;}if(!caught)fail("Expected function to throw");if(expected instanceof RegExp && !expected.test(String(error?.message || error)))fail("Thrown error did not match");else if(typeof expected==="function" && !(error instanceof expected))fail("Thrown error has wrong type");else if(expected!==null && typeof expected==="object" && !(expected instanceof RegExp)){
 const keys=Object.keys(expected);if(!keys.length || keys.some(k=>k!=="name" && k!=="message"))fail("Unsupported throws matcher");
 for(const key of keys){const wanted=expected[key];const actual=error?.[key];if(wanted instanceof RegExp){if(!wanted.test(String(actual)))fail("Thrown error property did not match");}else if(typeof wanted!=="string" || actual!==wanted)fail("Thrown error property did not match");}
}else if(expected!==undefined && !(expected instanceof RegExp) && typeof expected!=="function")fail("Unsupported throws matcher");}
const strict=Object.assign(ok,{strictEqual:equal,equal,ok,throws,fail});
strict.strict=strict; export {strict,equal,equal as strictEqual,ok,throws,fail}; export default strict;
`,
  "nexus:private": `import {report} from "node:test"; export default report;`,
};
// Candidates may access only the public test/assert API, not the report export.
builtins["nexus:test-public"] = 'export {test, default} from "nexus:test";';
runtime.setModuleLoader(
  (name) => {
    if (files.has(name)) return files.get(name);
    if (Object.hasOwn(builtins, name)) return builtins[name];
    throw Error("Module is unavailable in the isolated runner");
  },
  (base, name) => {
    if (base === "/trusted-entry.js" && name === "nexus:private") return name;
    if (base === "nexus:private" && name === "node:test") return "nexus:test";
    if (base === "nexus:test-public" && name === "nexus:test") return name;
    if (name === "node:test") return "nexus:test-public";
    if (name === "node:assert" || name === "node:assert/strict")
      return "nexus:assert";
    if (!name.startsWith("./") && !name.startsWith("../"))
      throw Error(
        "Only candidate-relative imports and supported test/assert modules are allowed",
      );
    const resolved = path.posix.normalize(
      path.posix.join(path.posix.dirname(base), name),
    );
    if (!resolved.startsWith("/candidate/") || !files.has(resolved))
      throw Error("Import is outside the candidate or unsupported");
    return resolved;
  },
);
function evaluate(source, filename, options) {
  const result = vm.evalCode(source, filename, options);
  if (result.error) {
    const detail = vm.dump(result.error);
    result.error.dispose();
    throw Error(
      String(detail?.message || "Isolated runtime error").slice(0, 500),
    );
  }
  return result.value;
}
let report;
try {
  const format = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const bridge = vm.newFunction("formatUSD", (amount) => {
    if (vm.typeof(amount) !== "number")
      throw Error("USD formatter requires a number");
    return vm.newString(format.format(vm.getNumber(amount)));
  });
  vm.setProp(vm.global, "__nexus_format_usd", bridge);
  bridge.dispose();
  evaluate(
    `{const format=__nexus_format_usd;delete globalThis.__nexus_format_usd;
 globalThis.Intl=Object.freeze({NumberFormat:class NumberFormat {
 constructor(locale,options){if(locale!=="en-US" || options?.style!=="currency" || options?.currency!=="USD" || Object.keys(options).some(k=>!["style","currency","minimumFractionDigits","maximumFractionDigits"].includes(k)) || (options.minimumFractionDigits!==undefined && options.minimumFractionDigits!==2) || (options.maximumFractionDigits!==undefined && options.maximumFractionDigits!==2))throw Error("Only en-US USD formatting with two decimal places is supported");}
 format(value){return format(value);}
 }});}`,
    "/trusted-setup.js",
  ).dispose();
  // Load the harness before candidate code can change built-in globals.
  evaluate('import test from "node:test";', "/trusted-init.js", {
    type: "module",
  }).dispose();
  for (const file of testFiles) {
    const module = evaluate(files.get(file), file, { type: "module" });
    const state = vm.getPromiseState(module);
    try {
      if (state.type === "pending")
        throw Error("Async modules are unsupported");
      if (state.type === "rejected") throw Error("Module evaluation failed");
    } finally {
      if (state.type === "fulfilled" && state.value !== module)
        state.value.dispose();
      if (state.type === "rejected" && state.error !== module)
        state.error.dispose();
      module.dispose();
    }
  }
  const reportModule = evaluate(
    'import report from "nexus:private"; export default report();',
    "/trusted-entry.js",
    { type: "module" },
  );
  // ESM evaluation returns a namespace/promise depending on engine configuration;
  // retrieve the completed module namespace's default export through evalCode.
  let namespace = reportModule;
  const state = vm.getPromiseState(reportModule);
  if (state.type === "fulfilled") {
    namespace = state.value;
  } else if (state.type === "pending" || state.type === "rejected")
    throw Error("Async module evaluation is unsupported");
  const value = vm.getProp(namespace, "default");
  const rows = JSON.parse(vm.getString(value));
  value.dispose();
  if (namespace !== reportModule) namespace.dispose();
  reportModule.dispose();
  if (!Array.isArray(rows) || !rows.length || rows.length > 50)
    throw Error("No completed synchronous candidate tests");
  const passed = rows.filter((r) => r.status === "passed").length;
  report = {
    engine: "quickjs-wasm-0.32.0",
    state: passed === rows.length ? "passed" : "failed",
    passed,
    failed: rows.length - passed,
    tests: rows,
    testFiles: testFiles.map((p) => p.slice(11)),
    scope: "candidate-supplied synchronous tests",
    installation: "not-performed",
    network: "unavailable",
    filesystem: "unavailable",
  };
} finally {
  vm.dispose();
  runtime.dispose();
}

parentPort.postMessage(report);
