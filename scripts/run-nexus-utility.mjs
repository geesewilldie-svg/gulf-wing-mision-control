// A single USD call in the same bounded, source-only WebAssembly guest.
import { parentPort, workerData } from "node:worker_threads";
import contract from "../lib/foundation/usd-contract.json" with { type: "json" };
import { createGuest } from "./nexus-wasm-runtime.mjs";
if (
  typeof workerData.amount !== "number" ||
  !Number.isFinite(workerData.amount)
)
  throw Error("A finite amount is required");
const guest = await createGuest(workerData.candidate, { sourceOnly: true });
const { files, vm, evaluate, namespace } = guest;
let module, fn, amount, result, text;
try {
  const file = "/candidate/" + contract.sourcePath.replace(/\.ts$/, ".js");
  if (!files.has(file)) throw Error("USD module is missing");
  module = namespace(evaluate(files.get(file), file, { type: "module" }));
  fn = vm.getProp(module, contract.exportName);
  if (vm.typeof(fn) !== "function") throw Error("USD export is unavailable");
  amount = vm.newNumber(workerData.amount);
  result = vm.callFunction(fn, vm.undefined, [amount]);
  if (result.error || vm.typeof(result.value) !== "string")
    throw Error("USD utility failed to return a string");
  text = vm.getString(result.value);
  if (text.length > 512) throw Error("USD output exceeds its budget");
  const expected = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(workerData.amount);
  if (text !== expected)
    throw Error("USD result failed its per-input contract check");
} finally {
  if (result?.error?.alive) result.error.dispose();
  if (result?.value?.alive) result.value.dispose();
  if (amount?.alive) amount.dispose();
  if (fn?.alive) fn.dispose();
  if (module?.alive) module.dispose();
  guest.dispose();
}
parentPort.postMessage({ text, engine: "quickjs-wasm-0.32.0", checked: true });
