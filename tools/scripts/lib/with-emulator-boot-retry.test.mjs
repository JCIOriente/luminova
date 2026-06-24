import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, chmodSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const WRAPPER = fileURLToPath(new URL("../with-emulator-boot-retry.sh", import.meta.url));

// A fake `firebase emulators:exec`. Its LAST arg is the (marker-injected) command
// string the wrapper wants run "after boot". It bumps a counter file each call so
// the test can assert how many boot ATTEMPTS the wrapper made, and it only runs
// that command once the simulated boot "succeeds" — i.e. on attempt
// > SIM_BOOT_FAIL_UNTIL. A failed boot exits non-zero WITHOUT running the command,
// so the wrapper's marker is never created (the real boot-vs-test signal).
function fakeExec(dir) {
  const path = join(dir, "fake-exec.sh");
  writeFileSync(
    path,
    `#!/usr/bin/env bash
cnt="$SIM_COUNT_FILE"
n=$(cat "$cnt" 2>/dev/null || echo 0); n=$((n + 1)); echo "$n" > "$cnt"
if [ "$n" -le "\${SIM_BOOT_FAIL_UNTIL:-0}" ]; then
  echo "fake: boot failed (attempt $n)" >&2
  exit 1
fi
# Boot "succeeded": run the marker-injected command via a shell, like emulators:exec.
sh -c "\${!#}"
`,
  );
  chmodSync(path, 0o755);
  return path;
}

function run(env, ...args) {
  return new Promise((resolve) => {
    const p = spawn("bash", [WRAPPER, ...args], { env: { ...process.env, ...env } });
    let stderr = "";
    p.stderr.on("data", (d) => (stderr += d));
    p.on("close", (code) => resolve({ code, stderr }));
  });
}

function ctx(t) {
  const dir = mkdtempSync(join(tmpdir(), "emu-boot-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const count = join(dir, "count");
  return { dir, count, exec: fakeExec(dir) };
}

const attempts = (count) => Number(readFileSync(count, "utf8").trim());

test("boots first try, runs the test once, succeeds", async (t) => {
  const { count, exec } = ctx(t);
  const env = { SIM_COUNT_FILE: count, SIM_BOOT_FAIL_UNTIL: "0", EMULATOR_BOOT_BACKOFF: "0" };
  const { code } = await run(env, "bash", exec, "true");
  assert.equal(code, 0, "expected success");
  assert.equal(attempts(count), 1, "should not retry a clean boot");
});

test("test FAILS after a good boot -> propagate, NEVER retry (race guard not masked)", async (t) => {
  const { count, exec } = ctx(t);
  const env = { SIM_COUNT_FILE: count, SIM_BOOT_FAIL_UNTIL: "0", EMULATOR_BOOT_BACKOFF: "0" };
  // Inner command exits 1 -> the emulator booted (marker set), the TEST failed.
  const { code } = await run(env, "bash", exec, "exit 7");
  assert.equal(code, 7, "must propagate the test's exit code");
  assert.equal(attempts(count), 1, "a test failure must NOT be retried");
});

test("transient boot flake then success -> retries and recovers", async (t) => {
  const { count, exec } = ctx(t);
  // Fail boot on attempts 1 and 2, succeed on 3.
  const env = { SIM_COUNT_FILE: count, SIM_BOOT_FAIL_UNTIL: "2", EMULATOR_BOOT_BACKOFF: "0" };
  const { code } = await run(env, "bash", exec, "true");
  assert.equal(code, 0, "should recover after transient boot failures");
  assert.equal(attempts(count), 3, "should have booted on the 3rd attempt");
});

test("boot never succeeds -> fails after the attempt budget", async (t) => {
  const { count, exec } = ctx(t);
  const env = {
    SIM_COUNT_FILE: count,
    SIM_BOOT_FAIL_UNTIL: "99",
    EMULATOR_BOOT_ATTEMPTS: "3",
    EMULATOR_BOOT_BACKOFF: "0",
  };
  const { code, stderr } = await run(env, "bash", exec, "true");
  assert.notEqual(code, 0, "a permanently-broken boot must fail");
  assert.equal(attempts(count), 3, "should try exactly the attempt budget");
  assert.match(stderr, /boot/i);
});

test("attempt budget is configurable", async (t) => {
  const { count, exec } = ctx(t);
  const env = {
    SIM_COUNT_FILE: count,
    SIM_BOOT_FAIL_UNTIL: "99",
    EMULATOR_BOOT_ATTEMPTS: "5",
    EMULATOR_BOOT_BACKOFF: "0",
  };
  await run(env, "bash", exec, "true");
  assert.equal(attempts(count), 5, "should honor EMULATOR_BOOT_ATTEMPTS");
});

test("invalid attempt budget falls back to running (never silent-passes)", async (t) => {
  const { count, exec } = ctx(t);
  // ATTEMPTS=0 must NOT skip the loop and exit 0 having run nothing.
  const env = { SIM_COUNT_FILE: count, SIM_BOOT_FAIL_UNTIL: "0", EMULATOR_BOOT_ATTEMPTS: "0" };
  const { code } = await run(env, "bash", exec, "true");
  assert.equal(code, 0, "should still boot+run, then succeed");
  assert.equal(attempts(count), 1, "must actually run the command, not skip it");
});

test("exits 2 with usage when given no command", async () => {
  const { code, stderr } = await run({});
  assert.equal(code, 2);
  assert.match(stderr, /usage/i);
});
