import { addFolder } from "./nexus-folders-lib.mjs";
try {
  console.log(
    await addFolder(process.argv[2], process.argv[3], process.argv[4]),
  );
} catch (e) {
  console.error(e.message);
  process.exitCode = 1;
}
