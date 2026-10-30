import { after, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { appendFileSync, cpSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { seedLocal } from "../../../packages/brand/src/cli/seed.ts";
import { isRebuildableBrandSeed } from "./brand-seed.mjs";

const REPO = fileURLToPath(new URL("../../../", import.meta.url));
const roots = [];
let root;
const local = (path = "") => join(root, "brand", "local", path);

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "wt-brand-seed-"));
  roots.push(root);
  cpSync(join(REPO, "brand", "example"), join(root, "brand", "example"), { recursive: true });
});

after(() => {
  for (const dir of roots) rmSync(dir, { recursive: true, force: true });
});

test("a brand/local/ just as install seeded it can be rebuilt", () => {
  assert.equal(seedLocal({ repoRoot: root, env: {} }), true);
  assert.equal(isRebuildableBrandSeed(root), true);
});

test("no brand/local/ is not a seed", () => {
  assert.equal(isRebuildableBrandSeed(root), false);
});

test("an edited seeded file is the member's", () => {
  seedLocal({ repoRoot: root, env: {} });
  appendFileSync(local("brand.toml"), "# my chapter\n");
  assert.equal(isRebuildableBrandSeed(root), false);
});

test("an edited image is the member's", () => {
  seedLocal({ repoRoot: root, env: {} });
  appendFileSync(local("spotlight/favicon-16.png"), "edited");
  assert.equal(isRebuildableBrandSeed(root), false);
});

test("a file the seed never wrote is the member's", () => {
  seedLocal({ repoRoot: root, env: {} });
  writeFileSync(local("icon-master.svg"), "<svg/>");
  assert.equal(isRebuildableBrandSeed(root), false);
});

test("a symlink is the member's", () => {
  seedLocal({ repoRoot: root, env: {} });
  symlinkSync(local("og-image.png"), local("link.png"));
  assert.equal(isRebuildableBrandSeed(root), false);
});

test("a manifest from a pull, or a malformed one, is not the seed", () => {
  seedLocal({ repoRoot: root, env: {} });
  writeFileSync(local(".pull-manifest.json"), "{");
  assert.equal(isRebuildableBrandSeed(root), false);
});
