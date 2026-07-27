import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SUCCESS_MARKER = "NATIVE_SMOKE_OK";
const PROCESSING_EXCEPTION = /exception while processing file/i;

export function validateNativeSmokeOutput(output) {
  if (PROCESSING_EXCEPTION.test(output)) {
    return "FreeCAD reported an exception while processing the native smoke";
  }

  const markerCount = output
    .split(/\r?\n/)
    .filter((line) => line.trim() === SUCCESS_MARKER).length;
  if (markerCount !== 1) {
    return "FreeCAD did not emit exactly one " + SUCCESS_MARKER + " marker";
  }

  return null;
}

export function runNativeSmoke(command = process.env.FREECAD_CMD) {
  if (!command) {
    process.stderr.write("FREECAD_CMD must name a FreeCADCmd executable\n");
    return 1;
  }

  const cwd = process.cwd();
  const result = spawnSync(
    command,
    [
      "-P",
      resolve(cwd, "freecad/PatchCAD"),
      resolve(cwd, "freecad/PatchCAD/freecad/PatchCAD/tests/native_smoke.py"),
    ],
    { cwd, encoding: "utf8" },
  );
  const output = String(result.stdout ?? "") + String(result.stderr ?? "");
  if (output) {
    process.stdout.write(output);
  }
  if (result.error) {
    process.stderr.write(result.error.message + "\n");
    return 1;
  }
  if (result.status !== 0) {
    return result.status ?? 1;
  }

  const validationError = validateNativeSmokeOutput(output);
  if (validationError) {
    process.stderr.write(validationError + "\n");
    return 1;
  }
  return 0;
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  process.exitCode = runNativeSmoke();
}
