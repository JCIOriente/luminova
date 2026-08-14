// The audit script is a BLOCKING pre-deploy gate whose product is a per-doc worklist printed
// to stdout. It used to end on `process.exit(...)`, which returns the right code and drops
// whatever stdout still had buffered — and on POSIX a pipe (any CI capture, any `| tee`) is an
// async write. The bigger the worklist, the more of it is lost. This test runs the REAL script
// against a stubbed firebase-admin, with stdout piped, and asserts the tail survives.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT = fileURLToPath(new URL("../audit-soft-delete-shapes.mjs", import.meta.url));
/** Enough malformed docs that the worklist far exceeds a 64 KiB pipe buffer. Each one prints
 *  its problem line plus the ~900-char PUBLISHED remedy block. */
const DOC_COUNT = 400;

const STUB_APP = `export function initializeApp() {}
export function applicationDefault() {
  return {};
}
`;

const STUB_FIRESTORE = `const DOC_COUNT = ${DOC_COUNT};

export const FieldPath = { documentId: () => "__name__" };

// Every members doc is a non-bool \`active\`: the ambiguous shape, so it is never truncated
// from the listing, and every one of them is PUBLISHED, so each prints the long remedy block.
function docsIn(coll) {
  if (coll !== "members") return [];
  return Array.from({ length: DOC_COUNT }, (_, i) => {
    const id = "m" + String(i).padStart(3, "0");
    return {
      id,
      data: () => ({ active: "false", deletedAt: null, name: "Member " + id }),
      ref: { update: async () => {} },
    };
  });
}

function query(coll, state) {
  return {
    orderBy: () => query(coll, state),
    limit: (size) => query(coll, { ...state, size }),
    startAfter: (cursor) => query(coll, { ...state, after: cursor.id }),
    get: async () => {
      const all = docsIn(coll);
      const from = state.after ? all.findIndex((d) => d.id === state.after) + 1 : 0;
      const docs = all.slice(from, from + (state.size ?? all.length));
      return { empty: docs.length === 0, size: docs.length, docs };
    },
  };
}

export function getFirestore() {
  return {
    collection: (coll) => query(coll, {}),
    doc: (path) => ({ path }),
    getAll: async (...refs) => refs.map(() => ({ exists: true, data: () => ({}) })),
    terminate: async () => {},
  };
}
`;

function stubbedCopyOfTheScript() {
  const dir = mkdtempSync(join(tmpdir(), "audit-shapes-"));
  const pkg = join(dir, "node_modules", "firebase-admin");
  mkdirSync(pkg, { recursive: true });
  writeFileSync(
    join(pkg, "package.json"),
    JSON.stringify({
      name: "firebase-admin",
      version: "0.0.0-stub",
      type: "module",
      exports: { "./app": "./app.mjs", "./firestore": "./firestore.mjs" },
    }),
  );
  writeFileSync(join(pkg, "app.mjs"), STUB_APP);
  writeFileSync(join(pkg, "firestore.mjs"), STUB_FIRESTORE);
  // A copy, so the stub resolves — but a byte-for-byte copy of the real script, so a
  // process.exit() reintroduced there fails this test.
  const script = join(dir, "audit-soft-delete-shapes.mjs");
  copyFileSync(SCRIPT, script);
  return script;
}

/**
 * Run the script with stdout piped, and start READING it late. The delay is the whole point:
 * an instantaneous reader keeps the 64 KiB pipe buffer empty, so the child's writes complete
 * synchronously and even a process.exit() looks fine — which is exactly why this bug survives
 * casual testing. A consumer that is merely normal (a CI log collector, `| tee`, a terminal)
 * lets the buffer fill, and every byte past it is queued in the child. process.exit() throws
 * that queue away; process.exitCode does not.
 */
async function run(script, { args = [], env = {}, readDelay = 0 } = {}) {
  const child = spawn(process.execPath, [script, ...args], {
    // Pipes on both, never inherit: on POSIX a TTY write is synchronous, so a truncation
    // test that inherits the terminal tests nothing.
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, FIRESTORE_EMULATOR_HOST: "127.0.0.1:0", ...env },
  });
  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");

  let code;
  // 'close' = the child exited AND its stdio closed. With the reader attached in time that is
  // after the last chunk; with a child that exited early it fires at once, on whatever little
  // it managed to push — which is the failure this test is here to see.
  const closed = new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("exit", (status) => (code = status));
    child.on("close", resolve);
  });
  // With readDelay the stream stays paused: a Readable with no consumer never starts reading
  // the handle, so the pipe fills and the child's remaining writes queue inside the child.
  const read = () => {
    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.on("data", (chunk) => (stderr += chunk));
  };
  if (readDelay > 0) setTimeout(read, readDelay);
  else read();

  await closed;
  return { code, stdout, stderr };
}

test("the malformed-doc worklist survives a piped stdout", async () => {
  // readDelay is load-bearing, not tuning. With a reader attached from the start the pipe
  // drains as fast as the child fills it, every write completes, and process.exit() would
  // have nothing left to drop — the test would pass against the very bug it exists for
  // (measured: it did). Leaving the stream paused fills the 64 KiB pipe and queues the rest
  // INSIDE the child, which is the state process.exit() discards.
  const { code, stdout, stderr } = await run(stubbedCopyOfTheScript(), { readDelay: 250 });

  assert.equal(stderr, "");
  assert.equal(code, 1, "the gate still exits 1 on malformed docs");
  // The volume is the point — a worklist that fits in one pipe write proves nothing.
  assert.ok(stdout.length > 200_000, `expected a large worklist, got ${stdout.length} bytes`);
  assert.match(stdout, new RegExp(`members: ${DOC_COUNT} malformed doc\\(s\\)`));
  // The LAST doc of the listing and the closing summary are what process.exit() dropped.
  assert.match(stdout, /members\/m399: non-bool active \("false"\)/);
  assert.match(stdout, /PUBLISHED: boardShowcase\/m399 exists and STAYS PUBLISHED/);
  assert.match(stdout, new RegExp(`\\n${DOC_COUNT} malformed doc\\(s\\) found`));
  assert.match(stdout, /Run with --repair, or fix by hand\./);
});

test("a refused confirmation still prints its reason to a pipe and exits 2", async () => {
  // No FIRESTORE_EMULATOR_HOST: the production confirmation gate is what must refuse here.
  const { code, stdout, stderr } = await run(stubbedCopyOfTheScript(), {
    args: ["--repair", "--confirm=nope"],
    // Empty, not absent: `run` spreads process.env, so an absent key would inherit a real
    // FIRESTORE_EMULATOR_HOST from the caller's shell and silently take the emulator path.
    env: { FIRESTORE_EMULATOR_HOST: "" },
  });

  assert.equal(code, 2);
  assert.match(stdout, /Auditing soft-delete shapes in PRODUCTION/);
  assert.match(stderr, /Refusing to repair: --confirm must be exactly "repair-production-shapes"/);
});
