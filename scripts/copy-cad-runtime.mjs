import { access, copyFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = resolve(
  projectRoot,
  "node_modules/replicad-opencascadejs/src/replicad_single.wasm",
);
const destination = resolve(
  projectRoot,
  "public/cad-runtime/replicad_single-0.23.0.wasm",
);

try {
  await access(source);
} catch {
  throw new Error(
    `Pinned CAD runtime is missing at ${source}. Run npm ci; Vercel must not download or compile OCCT.`,
  );
}

await mkdir(dirname(destination), { recursive: true });
await copyFile(source, destination);
