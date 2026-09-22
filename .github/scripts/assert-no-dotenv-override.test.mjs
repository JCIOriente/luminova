/** Fixture tests for the repo-side dotenv guard.
 *
 *  This guard has already shipped with two holes — it scanned a directory firebase-tools
 *  never reads, and it missed the `export FOO=bar` spelling its own target parser accepts —
 *  and both were found only once the logic was extracted from YAML and run against files.
 *
 *  Run: node --test .github/scripts/assert-no-dotenv-override.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), "assert-no-dotenv-override.sh");

/** Lays out `{ "dist/.env": "FOO=bar" }` under a fresh temp root and runs the guard over the
 *  given subdirectories. */
function run(files, dirs) {
  const root = mkdtempSync(join(tmpdir(), "dotenv-guard-"));
  for (const [rel, body] of Object.entries(files)) {
    mkdirSync(join(root, dirname(rel)), { recursive: true });
    writeFileSync(join(root, rel), body);
  }
  try {
    const out = execFileSync("bash", [SCRIPT, ...dirs], { cwd: root, encoding: "utf8" });
    return { status: 0, out };
  } catch (e) {
    return { status: e.status, out: `${e.stdout ?? ""}${e.stderr ?? ""}` };
  }
}

test("passes when no env file sets the key", () => {
  const r = run({ "beacon/.env": "SOMETHING_ELSE=1\n" }, ["beacon"]);
  assert.equal(r.status, 0);
  assert.match(r.out, /ok: no FUNCTIONS_EMULATOR override in beacon\/\.env\*/);
});

test("passes, and says so honestly, when no directory exists", () => {
  // The normal case in PR CI when beacon was not built. It must not claim to have scanned
  // `beacon/.env*` — an "ok" line naming a path that was never read is how a guard gets
  // believed after it has stopped working.
  const r = run({}, ["beacon", "beacon/dist"]);
  assert.equal(r.status, 0);
  assert.match(r.out, /none of the given directories exist/);
});

test("catches a plain assignment", () => {
  const r = run({ "beacon/dist/.env": "FUNCTIONS_EMULATOR=true\n" }, ["beacon", "beacon/dist"]);
  assert.equal(r.status, 1);
  assert.match(r.out, /::error::FUNCTIONS_EMULATOR is set/);
});

test("catches the `export FOO=bar` spelling firebase-tools' parser also honours", () => {
  // The hole #229 found. firebase-tools' LINE_RE is `^\s*(?:export)?\s*([\w./]+)\s*=`, so it
  // reads this as the same assignment — while a naive `^FUNCTIONS_EMULATOR=` grep does not.
  const r = run({ "beacon/dist/.env.local": "export FUNCTIONS_EMULATOR=true\n" }, ["beacon/dist"]);
  assert.equal(r.status, 1);
});

test("catches the spellings the parser's optional whitespace admits", () => {
  for (const line of [
    "  FUNCTIONS_EMULATOR = true",
    "\tFUNCTIONS_EMULATOR=true",
    "exportFUNCTIONS_EMULATOR=true",
    "export   FUNCTIONS_EMULATOR   =true",
  ]) {
    const r = run({ "beacon/dist/.env": `${line}\n` }, ["beacon/dist"]);
    assert.equal(r.status, 1, `missed: ${line}`);
  }
});

test("scans EVERY .env* file in the directory, not just .env", () => {
  const r = run(
    { "beacon/dist/.env": "OK=1\n", "beacon/dist/.env.production": "FUNCTIONS_EMULATOR=true\n" },
    ["beacon/dist"],
  );
  assert.equal(r.status, 1);
});

test("scans the SOURCE directory, not only the repo one", () => {
  // The first hole: the guard scanned `apps/beacon` and reported clean while
  // `apps/beacon/dist` — the directory firebase-tools actually deploys from — held the
  // override. Both arms must be live.
  const r = run({ "beacon/.env": "OK=1\n", "beacon/dist/.env": "FUNCTIONS_EMULATOR=true\n" }, [
    "beacon",
    "beacon/dist",
  ]);
  assert.equal(r.status, 1);
});

test("does not fire on a different key, or on a mention inside a value", () => {
  const r = run({ "beacon/dist/.env": "NOTE=FUNCTIONS_EMULATOR=true is what we must not set\n" }, [
    "beacon/dist",
  ]);
  assert.equal(r.status, 0);
});

test("FAILS when given no directories, rather than passing vacuously", () => {
  const r = run({}, []);
  assert.equal(r.status, 2);
});
