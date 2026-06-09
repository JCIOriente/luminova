import { build } from "esbuild";
import { readFile, writeFile, rm, mkdir, symlink } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// Cloud Functions installs the uploaded source with npm, which cannot resolve
// pnpm's `workspace:` protocol. So we bundle the workspace deps (@luminova/*)
// into a single dist/index.js and emit a clean package.json that lists only the
// real npm runtime deps. firebase-admin / firebase-functions stay external:
// they have dynamic requires that don't bundle cleanly, and Node resolves them
// from apps/beacon/node_modules during firebase's local discovery (dist is
// nested), then from dist/node_modules (npm-installed) at runtime in the cloud.
//
// All paths are absolute from this module's location so the bundle lands in
// apps/beacon/dist regardless of the process CWD (turbo, pnpm, or a direct run).
const root = dirname(fileURLToPath(import.meta.url));
const dist = join(root, "dist");
const pkg = JSON.parse(await readFile(join(root, "package.json")));

const runtimeDeps = ["firebase-admin", "firebase-functions"];
const external = runtimeDeps.flatMap((name) => [name, `${name}/*`]);

await rm(dist, { recursive: true, force: true });

await build({
  absWorkingDir: root,
  entryPoints: [join(root, "src/index.ts")],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node24",
  outfile: join(dist, "index.js"),
  external,
  logLevel: "info",
});

await mkdir(dist, { recursive: true });
await writeFile(
  join(dist, "package.json"),
  JSON.stringify(
    {
      name: pkg.name,
      type: "module",
      main: "index.js",
      engines: pkg.engines,
      dependencies: Object.fromEntries(runtimeDeps.map((name) => [name, pkg.dependencies[name]])),
    },
    null,
    2,
  ) + "\n",
);

// firebase-tools resolves the firebase-functions SDK from the source dir during
// local discovery, and it does not walk up to the workspace store. Link beacon's
// real (pnpm) node_modules into dist so discovery finds the external runtime
// deps. The default functions `ignore` excludes node_modules from the upload, so
// the cloud still installs from the clean dist/package.json above.
await symlink(join(root, "node_modules"), join(dist, "node_modules"), "dir");
