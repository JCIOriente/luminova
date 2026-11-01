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
  const env = { EMULATOR_LOCK_FILE: lock };

  await Promise.all([run(env, "bash", "-c", body), run(env, "bash", "-c", body)]);

  const lines = readFileSync(log, "utf8").trim().split("\n");
  assert.deepEqual(
    lines,
    ["ENTER", "EXIT", "ENTER", "EXIT"],
    "runs overlapped — lock did not serialize",
  );
  assert.ok(!existsSync(lock), "lock dir not released on exit");
});

// Ubuntu 26.04's uutils mkdir let two simultaneous callers both win, and two spawns only
// line up that tightly about one time in four. Many contenders on many locks at once make
// a non-exclusive primitive overlap on every run, without one run paying for many rounds.
test("exclusive under a burst of simultaneous contenders", async (t) => {
  const dir = mkdtempSync(join(tmpdir(), "emu-lock-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const contenders = Array.from({ length: 12 }, (_, i) => join(dir, `log-${i}`)).flatMap((log) => {
    const env = { EMULATOR_LOCK_FILE: `${log}.lock`, EMULATOR_LOCK_TIMEOUT: "1" };
    const body = `printf 'ENTER\\n' >> '${log}'; sleep 1.5; printf 'EXIT\\n' >> '${log}'`;
    return Array.from({ length: 5 }, () => [log, env, body]);
  });

  await Promise.all(contenders.map(([, env, body]) => run(env, "bash", "-c", body)));

  for (const log of new Set(contenders.map(([path]) => path))) {
    const lines = readFileSync(log, "utf8").trim().split("\n");
    lines.forEach((line, i) => assert.equal(line, i % 2 ? "EXIT" : "ENTER", "runs overlapped"));
  }
});

test("concurrent reclaim of a stale lock still serializes (no double-acquire)", async (t) => {
  const dir = mkdtempSync(join(tmpdir(), "emu-lock-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const log = join(dir, "log");
  const lock = join(dir, "lock");
  // Pre-seed a stale lock so both waiters race the reclaim path at once.
  writeFileSync(lock, DEAD_PID);
  const env = { EMULATOR_LOCK_FILE: lock, EMULATOR_LOCK_TIMEOUT: "30" };
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
  writeFileSync(lock, DEAD_PID);

  const { code } = await run({ EMULATOR_LOCK_FILE: lock }, "bash", "-c", `printf ok > '${marker}'`);

  assert.equal(code, 0, "wrapper did not run the command after reclaiming a stale lock");
  assert.equal(readFileSync(marker, "utf8"), "ok");
});

test("reclaims a directory left by the old mkdir lock format", async (t) => {
  const dir = mkdtempSync(join(tmpdir(), "emu-lock-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const lock = join(dir, "lock");
  const marker = join(dir, "ran");
  mkdirSync(lock);
  writeFileSync(join(lock, "pid"), DEAD_PID);

  const { code } = await run({ EMULATOR_LOCK_FILE: lock }, "bash", "-c", `printf ok > '${marker}'`);

  assert.equal(code, 0, "wrapper did not run the command after clearing the old lock");
  assert.equal(readFileSync(marker, "utf8"), "ok");
  assert.ok(!existsSync(lock), "lock not released on exit");
});

test("self-heals a wedged reap file (orphaned reaper) instead of failing forever", async (t) => {
  const dir = mkdtempSync(join(tmpdir(), "emu-lock-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const lock = join(dir, "lock");
  const marker = join(dir, "ran");
  // A stale lock that normally self-heals via reclaim...
  writeFileSync(lock, DEAD_PID);
  // ...but a reaper was SIGKILL'd holding the reap file, wedging the reclaim path.
  writeFileSync(`${lock}.reap`, DEAD_PID);

  const { code } = await run(
    { EMULATOR_LOCK_FILE: lock, EMULATOR_LOCK_TIMEOUT: "1" },
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
  writeFileSync(lock, String(process.pid));

  const { code, stderr } = await run(
    { EMULATOR_LOCK_FILE: lock, EMULATOR_LOCK_TIMEOUT: "1" },
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
