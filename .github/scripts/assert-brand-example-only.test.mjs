/** Fixture tests for assert-brand-example-only.sh, the check that keeps a chapter's brand out of git.
 *
 *  Run: node --test .github/scripts/assert-brand-example-only.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), "assert-brand-example-only.sh");

/** A repo whose first commit holds `files` (path -> content); returns it and helpers. */
function repo(files) {
  const root = mkdtempSync(join(tmpdir(), "brand-example-only-"));
  const git = (...args) => {
    const r = spawnSync("git", ["-C", root, ...args], { encoding: "utf8" });
    assert.equal(r.status, 0, r.stderr);
    return r.stdout.trim();
  };
  const write = (path, content) => {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), content);
  };
  const commit = () => {
    git("add", "-A");
    git("-c", "user.name=t", "-c", "user.email=t@t", "commit", "-qm", "c", "--allow-empty");
    return git("rev-parse", "HEAD");
  };
  git("init", "-q");
  for (const [path, content] of Object.entries(files)) write(path, content);
  const base = commit();
  return { root, base, write, commit };
}

const UPSTREAM = {
  "brand/example/brand.json": '{"slug":"example"}',
  "brand/example/assets/logo-main.png": "png",
  "brand/brand.schema.json": "{}",
  "brand/bucket-lifecycle.json": "{}",
  "README.md": "readme",
};

const check = (root, base) => spawnSync("bash", [SCRIPT, base], { cwd: root, encoding: "utf8" });

test("an added chapter file fails, naming the path and why", () => {
  const { root, base, write, commit } = repo(UPSTREAM);
  write("brand/jci-andina/brand.json", '{"slug":"jci-andina"}');
  commit();
  const r = check(root, base);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /brand\/jci-andina\/brand\.json/);
  assert.match(r.stderr, /a chapter's brand lives in its bucket, never in git/);
});

test("an added file directly under brand/ fails", () => {
  const { root, base, write, commit } = repo(UPSTREAM);
  write("brand/notes.txt", "x");
  commit();
  const r = check(root, base);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /brand\/notes\.txt/);
});

test("an edited example file and the shared files pass", () => {
  const { root, base, write, commit } = repo(UPSTREAM);
  write("brand/example/brand.json", '{"slug":"example","name":"x"}');
  write("brand/example/assets/og-image.png", "png");
  write("brand/brand.schema.json", '{"type":"object"}');
  write("brand/bucket-lifecycle.json", '{"rule":[]}');
  write("README.md", "changed");
  commit();
  const r = check(root, base);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /only brand\/example\/ and the shared files/);
});

test("a deleted chapter folder passes", () => {
  const { root, base, commit } = repo({
    ...UPSTREAM,
    "brand/jci-oriente/brand.json": "{}",
    "brand/jci-oriente/assets/logo-main.png": "real logo",
  });
  rmSync(join(root, "brand/jci-oriente"), { recursive: true });
  commit();
  assert.equal(check(root, base).status, 0);
});

test("a chapter file replaced by a symlink fails", () => {
  const { root, base, commit } = repo({ ...UPSTREAM, "brand/jci-andina/brand.json": "{}" });
  rmSync(join(root, "brand/jci-andina/brand.json"));
  symlinkSync("../example/brand.json", join(root, "brand/jci-andina/brand.json"));
  commit();
  const r = check(root, base);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /brand\/jci-andina\/brand\.json/);
});

// Temporary: the brand.toml PR converts JCI Oriente's committed profile in place; the JCI
// Oriente removal PR deletes the folder and this allowance.
test("allows only JCI Oriente's brand.toml under its folder, for the one conversion", () => {
  const { root, base, write, commit } = repo({
    ...UPSTREAM,
    "brand/jci-oriente/brand.json": "{}",
    "brand/jci-oriente/site-content.json": "{}",
  });
  rmSync(join(root, "brand/jci-oriente/brand.json"));
  rmSync(join(root, "brand/jci-oriente/site-content.json"));
  write("brand/jci-oriente/brand.toml", 'name = "JCI Oriente"\n');
  commit();
  assert.equal(check(root, base).status, 0, check(root, base).stderr);

  write("brand/jci-oriente/assets/logo-main.png", "real logo");
  write("brand/jci-andina/brand.toml", 'name = "JCI Andina"\n');
  commit();
  const r = check(root, base);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /brand\/jci-oriente\/assets\/logo-main\.png/);
  assert.match(r.stderr, /brand\/jci-andina\/brand\.toml/);
  assert.doesNotMatch(r.stderr, /brand\/jci-oriente\/brand\.toml/);
});

test("allows exactly what .gitignore re-includes under brand/", () => {
  const scriptDir = dirname(SCRIPT);
  const gitignore = readFileSync(join(scriptDir, "..", "..", ".gitignore"), "utf8");
  // Upstream keeps jci-oriente committed until its removal; deleting it always passes.
  const reIncluded = [...gitignore.matchAll(/^!\/(brand\/\S+)$/gm)]
    .map(([, path]) => path)
    .filter((path) => path !== "brand/jci-oriente/");
  const pattern = readFileSync(SCRIPT, "utf8").match(/^\s*(brand\/.+)\) return 0 ;;$/m)?.[1];
  assert.ok(pattern, "allowed() case pattern not found");
  const allowed = pattern
    .split("|")
    .map((path) => path.trim().replace(/\*$/, ""))
    .filter((path) => path !== "brand/jci-oriente/brand.toml");
  assert.deepEqual(allowed.sort(), reIncluded.sort());
});

test("a rename into a chapter folder fails; a rename into the example passes", () => {
  const into = repo(UPSTREAM);
  mkdirSync(join(into.root, "brand/jci-andina"));
  renameSync(
    join(into.root, "brand/example/brand.json"),
    join(into.root, "brand/jci-andina/brand.json"),
  );
  into.commit();
  const r = check(into.root, into.base);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /brand\/jci-andina\/brand\.json/);
  assert.doesNotMatch(r.stderr, /brand\/example\/brand\.json/);

  const out = repo({ ...UPSTREAM, "brand/fixture/brand.json": '{"slug":"fixture","n":1}' });
  mkdirSync(join(out.root, "brand/example"), { recursive: true });
  renameSync(
    join(out.root, "brand/fixture/brand.json"),
    join(out.root, "brand/example/renamed.json"),
  );
  out.commit();
  assert.equal(check(out.root, out.base).status, 0);
});

test("judges every commit since the base, not only the last one", () => {
  const { root, base, write, commit } = repo(UPSTREAM);
  write("brand/jci-andina/brand.json", "{}");
  commit();
  write("README.md", "later");
  commit();
  assert.equal(check(root, base).status, 1);
});

test("a base that is no commit is a usage error, not a pass", () => {
  const { root } = repo(UPSTREAM);
  for (const args of [[], ["0000000000000000000000000000000000000000"]]) {
    const r = spawnSync("bash", [SCRIPT, ...args], { cwd: root, encoding: "utf8" });
    assert.equal(r.status, 2, r.stdout);
    assert.match(r.stderr, /usage|not a commit/);
  }
});
