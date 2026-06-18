import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const WRAPPER = fileURLToPath(new URL("../with-emulator-lock.sh", import.meta.url));
// A PID that cannot be alive (above every platform's pid_max), so the stale-lock
// reclaim path treats a lock stamped with it as abandoned.
const DEAD_PID = "2147483646";

function run(env, ...args) {
  return new Promise((resolve) => {
    const p = spawn("bash", [WRAPPER, ...args], { env: { ...process.env, ...env } });
    let stderr = "";
    p.stderr.on("data", (d) => (stderr += d));
    p.on("close", (code) => resolve({ code, stderr }));
  });
}

test("serializes concurrent runs — critical sections never overlap", async (t) => {
  const dir = mkdtempSync(join(tmpdir(), "emu-lock-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const log = join(dir, "log");
  const lock = join(dir, "lock");
  // Each invocation appends ENTER, holds briefly, then appends EXIT.
  const body = `printf 'ENTER\\n' >> '${log}'; sleep 0.4; printf 'EXIT\\n' >> '${log}'`;
  const env = { EMULATOR_LOCK_DIR: lock };

  await Promise.all([run(env, "bash", "-c", body), run(env, "bash", "-c", body)]);

  const lines = readFileSync(log, "utf8").trim().split("\n");
  assert.deepEqual(
    lines,
    ["ENTER", "EXIT", "ENTER", "EXIT"],
    "runs overlapped — lock did not serialize",
  );
  assert.ok(!existsSync(lock), "lock dir not released on exit");
});

test("concurrent reclaim of a stale lock still serializes (no double-acquire)", async (t) => {
  const dir = mkdtempSync(join(tmpdir(), "emu-lock-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const log = join(dir, "log");
  const lock = join(dir, "lock");
  // Pre-seed a stale lock so both waiters race the reclaim path at once.
  mkdirSync(lock);
  writeFileSync(join(lock, "pid"), DEAD_PID);
  const env = { EMULATOR_LOCK_DIR: lock, EMULATOR_LOCK_TIMEOUT: "30" };
  const body = `printf 'ENTER\\n' >> '${log}'; sleep 0.4; printf 'EXIT\\n' >> '${log}'`;

  await Promise.all([run(env, "bash", "-c", body), run(env, "bash", "-c", body)]);

  const lines = readFileSync(log, "utf8").trim().split("\n");
  assert.deepEqual(lines, ["ENTER", "EXIT", "ENTER", "EXIT"], "concurrent reclaim double-acquired");
});

test("reclaims a stale lock held by a dead PID", async (t) => {
  const dir = mkdtempSync(join(tmpdir(), "emu-lock-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const lock = join(dir, "lock");
  const marker = join(dir, "ran");
  // Pre-create the lock with a PID that cannot be alive.
  mkdirSync(lock);
  writeFileSync(join(lock, "pid"), DEAD_PID);

  const { code } = await run({ EMULATOR_LOCK_DIR: lock }, "bash", "-c", `printf ok > '${marker}'`);

  assert.equal(code, 0, "wrapper did not run the command after reclaiming a stale lock");
  assert.equal(readFileSync(marker, "utf8"), "ok");
});

test("self-heals a wedged reap dir (orphaned reaper) instead of failing forever", async (t) => {
  const dir = mkdtempSync(join(tmpdir(), "emu-lock-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const lock = join(dir, "lock");
  const marker = join(dir, "ran");
  // A stale lock that normally self-heals via reclaim...
  mkdirSync(lock);
  writeFileSync(join(lock, "pid"), DEAD_PID);
  // ...but a reaper was SIGKILL'd holding the reap dir, wedging the reclaim path.
  mkdirSync(`${lock}.reap`);

  const { code } = await run(
    { EMULATOR_LOCK_DIR: lock, EMULATOR_LOCK_TIMEOUT: "1" },
    "bash",
    "-c",
    `printf ok > '${marker}'`,
  );

  assert.equal(code, 0, "did not self-heal the wedged reap dir");
  assert.equal(readFileSync(marker, "utf8"), "ok");
});

test("times out (exit 1) when a live holder never releases", async (t) => {
  const dir = mkdtempSync(join(tmpdir(), "emu-lock-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const lock = join(dir, "lock");
  // Hold the lock with THIS process's PID (alive) so it is never reclaimed.
  mkdirSync(lock);
  writeFileSync(join(lock, "pid"), String(process.pid));

  const { code, stderr } = await run(
    { EMULATOR_LOCK_DIR: lock, EMULATOR_LOCK_TIMEOUT: "1" },
    "bash",
    "-c",
    "echo should-not-run",
  );

  assert.equal(code, 1, "expected timeout exit 1");
  assert.match(stderr, /timed out/);
});

test("exits 2 with usage when given no command", async () => {
  const { code, stderr } = await run({});
  assert.equal(code, 2);
  assert.match(stderr, /usage/);
});
