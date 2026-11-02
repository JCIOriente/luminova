import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";

const WRAPPER = fileURLToPath(new URL("../with-emulator-lock.sh", import.meta.url));
// A PID that cannot be alive (above every platform's pid_max), so the stale-lock
// reclaim path treats a lock stamped with it as abandoned.
const DEAD_PID = "2147483646";

function bash(env, args) {
  return new Promise((resolve) => {
    const p = spawn("bash", args, { env: { ...process.env, ...env } });
    let stderr = "";
    p.stderr.on("data", (d) => (stderr += d));
    p.on("close", (code) => resolve({ code, stderr }));
  });
}

function run(env, ...args) {
  return bash(env, [WRAPPER, ...args]);
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
  assert.ok(!existsSync(lock), "lock not released on exit");
});

// Ubuntu 26.04's uutils mkdir let two simultaneous callers both win, inside a window plain
// spawns rarely hit: a burst of them caught it one run in eight. So each pair spins on a
// start file and is released together, for enough rounds that a miss is not a real outcome.
// TIMEOUT 0 sends the loser straight out while the winner holds, which keeps a round short.
function contender(env, start, body) {
  const script = 'until [ -e "$1" ]; do :; done; exec bash "$2" bash -c "$3"';
  return bash(env, ["-c", script, "_", start, WRAPPER, body]);
}

test("exclusive when contenders start at the same instant", async (t) => {
  const dir = mkdtempSync(join(tmpdir(), "emu-lock-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));

  for (let round = 0; round < 30; round++) {
    const log = join(dir, `log-${round}`);
    const start = join(dir, `start-${round}`);
    const env = { EMULATOR_LOCK_FILE: `${log}.lock`, EMULATOR_LOCK_TIMEOUT: "0" };
    const body = `printf 'ENTER\\n' >> '${log}'; sleep 0.1; printf 'EXIT\\n' >> '${log}'`;
    const pair = [contender(env, start, body), contender(env, start, body)];
    await delay(50);
    writeFileSync(start, "");
    await Promise.all(pair);

    const lines = readFileSync(log, "utf8").trim().split("\n");
    lines.forEach((line, i) =>
      assert.equal(line, i % 2 ? "EXIT" : "ENTER", `runs overlapped in round ${round}`),
    );
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

test("waits for a live holder of the old mkdir lock format", async (t) => {
  const dir = mkdtempSync(join(tmpdir(), "emu-lock-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const lock = join(dir, "lock");
  mkdirSync(lock);
  writeFileSync(join(lock, "pid"), String(process.pid));

  const { code, stderr } = await run(
    { EMULATOR_LOCK_FILE: lock, EMULATOR_LOCK_TIMEOUT: "1" },
    "bash",
    "-c",
    "echo should-not-run",
  );

  assert.equal(code, 1, "reaped a running holder");
  assert.match(stderr, /timed out/);
  assert.ok(existsSync(join(lock, "pid")), "old-format lock was removed");
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
