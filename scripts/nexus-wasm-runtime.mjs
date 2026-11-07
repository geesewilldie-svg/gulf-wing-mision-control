// Trusted runtime construction shared by supplied tests and independent checks.
import path from "node:path";
import ts from "typescript";
import { getQuickJS } from "quickjs-emscripten";
export async function createGuest(
  candidate,
  { sourceOnly = false, builtins = {}, normalizeBuiltin } = {},
) {
  const files = new Map();
  for (const f of candidate.files) {
    if (
      !f.path.endsWith(".ts") ||
      f.path.endsWith(".d.ts") ||
      (sourceOnly && !f.path.startsWith("src/"))
    )
      continue;
    const emitted = ts.transpileModule(f.content, {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ESNext,
      },
      fileName: f.path,
    });
    files.set(
      "/candidate/" + f.path.replace(/\.ts$/, ".js"),
      emitted.outputText,
    );
  }
  const QuickJS = await getQuickJS(),
    runtime = QuickJS.newRuntime();
  runtime.setMemoryLimit(32 * 1024 * 1024);
  runtime.setMaxStackSize(512 * 1024);
  const deadline = Date.now() + 2000;
  runtime.setInterruptHandler(() => Date.now() > deadline);
  const vm = runtime.newContext();
  runtime.setModuleLoader(
    (name) => {
      if (files.has(name)) return files.get(name);
      if (Object.hasOwn(builtins, name)) return builtins[name];
      throw Error("Module is unavailable in the isolated runner");
    },
    (base, name) => {
      const special = normalizeBuiltin?.(base, name);
      if (special) return special;
      if (!name.startsWith("./") && !name.startsWith("../"))
        throw Error(
          "Only candidate-relative imports and supported modules are allowed",
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
      let detail;
      try {
        detail = vm.dump(result.error);
      } finally {
        if (result.error.alive) result.error.dispose();
      }
      throw Error(
        String(detail?.message || "Isolated runtime error").slice(0, 500),
      );
    }
    return result.value;
  }
  function namespace(handle) {
    const state = vm.getPromiseState(handle);
    if (state.type === "fulfilled") {
      if (state.value !== handle) handle.dispose();
      return state.value;
    }
    if (state.type === "rejected") state.error.dispose();
    handle.dispose();
    throw Error("Async or rejected modules are unsupported");
  }
  function dispose() {
    vm.dispose();
    runtime.dispose();
  }
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
  } catch (e) {
    dispose();
    throw e;
  }
  return { files, vm, runtime, evaluate, namespace, dispose };
}
