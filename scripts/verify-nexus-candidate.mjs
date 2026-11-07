// Independent host-side contract oracles. Candidate test code is never loaded.
import { createHash } from "node:crypto";
import { parentPort, workerData } from "node:worker_threads";
import contract from "../lib/foundation/usd-contract.json" with { type: "json" };
import { createGuest } from "./nexus-wasm-runtime.mjs";
const guest = await createGuest(workerData.candidate, { sourceOnly: true });
const { files, vm, evaluate, namespace } = guest;
let report, module, fn, isRangeError;
try {
  isRangeError = evaluate(
    `(()=>{const prototype=RangeError.prototype;const get=Object.getPrototypeOf;return error=>{if(error===null || typeof error!=="object")return false;for(let i=0;i<16&&error!==null;i++){if(error===prototype)return true;error=get(error);}return false;};})()`,
    "/trusted-error-type.js",
  );
  const file = "/candidate/" + contract.sourcePath.replace(/\.ts$/, ".js");
  if (!files.has(file))
    throw Error("USD contract requires " + contract.sourcePath);
  module = namespace(evaluate(files.get(file), file, { type: "module" }));
  fn = vm.getProp(module, contract.exportName);
  if (vm.typeof(fn) !== "function")
    throw Error("USD contract requires exported formatCurrency function");
  const inputs = {
    "negative-zero": -0,
    nan: NaN,
    infinity: Infinity,
    "negative-infinity": -Infinity,
  };
  const tests = [];
  for (const check of contract.cases) {
    const input = vm.newNumber(
      typeof check.input === "number" ? check.input : inputs[check.input],
    );
    let result;
    try {
      result = vm.callFunction(fn, vm.undefined, [input]);
      let passed = false;
      if (result.error) {
        if (check.errorName) {
          const name = vm.getProp(result.error, "name");
          try {
            passed =
              vm.typeof(name) === "string" &&
              vm.getString(name) === check.errorName;
            if (passed) {
              const typeResult = vm.callFunction(isRangeError, vm.undefined, [
                result.error,
              ]);
              try {
                passed =
                  !typeResult.error &&
                  vm.typeof(typeResult.value) === "boolean" &&
                  vm.dump(typeResult.value) === true;
              } finally {
                if (typeResult.error?.alive) typeResult.error.dispose();
                if (typeResult.value?.alive) typeResult.value.dispose();
              }
            }
          } finally {
            name.dispose();
          }
        }
      } else if (!check.errorName) {
        passed =
          vm.typeof(result.value) === "string" &&
          vm.getString(result.value) === check.expected;
      }
      tests.push({
        name: check.name,
        status: passed ? "passed" : "failed",
        detail: passed
          ? ""
          : check.errorName
            ? "Expected RangeError"
            : "Returned value did not match the fixed USD contract",
      });
    } finally {
      input.dispose();
      if (result?.error?.alive) result.error.dispose();
      if (result?.value?.alive) result.value.dispose();
    }
  }
  const passed = tests.filter((t) => t.status === "passed").length;
  report = {
    engine: "quickjs-wasm-0.32.0",
    profileId: contract.id,
    profileVersion: contract.version,
    profileHash: createHash("sha256")
      .update(JSON.stringify(contract))
      .digest("hex"),
    state: passed === tests.length ? "passed" : "failed",
    passed,
    failed: tests.length - passed,
    tests,
    testFiles: [],
    scope: "independent host-side USD contract checks",
    installation: "not-performed",
    network: "unavailable",
    filesystem: "unavailable",
  };
} finally {
  if (isRangeError?.alive) isRangeError.dispose();
  if (fn?.alive) fn.dispose();
  if (module?.alive) module.dispose();
  guest.dispose();
}
parentPort.postMessage(report);
