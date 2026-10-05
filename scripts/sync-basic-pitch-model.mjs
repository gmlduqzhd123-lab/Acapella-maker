import { mkdir, copyFile, readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
const require = createRequire(import.meta.url);
const root = resolve(
  dirname(require.resolve("@spotify/basic-pitch/package.json")),
  "model",
);
const destination = new URL("../public/models/basic-pitch/", import.meta.url);
const manifest = JSON.parse(
  await readFile(resolve(root, "model.json"), "utf8"),
);
const shards = manifest.weightsManifest.flatMap((group) => group.paths);
if (shards.length !== 1 || shards[0] !== "group1-shard1of1.bin")
  throw new Error("Unexpected official model manifest");
await mkdir(destination, { recursive: true });
for (const name of ["model.json", ...shards])
  await copyFile(resolve(root, name), new URL(name, destination));
console.log(
  "Official Basic Pitch model synchronized to public/models/basic-pitch",
);
