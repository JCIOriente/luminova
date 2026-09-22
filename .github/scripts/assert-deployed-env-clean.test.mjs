/** Fixture tests for the post-deploy App Check assertion.
 *
 *  The step it guards lives in `.github/workflows/deploy.yml`, where it runs once per release
 *  against real Cloud Run services — which is to say it is never exercised before it matters.
 *  The previous guard was inline YAML for that reason, and it shipped twice with a hole:
 *  first scanning a directory firebase-tools never reads, then missing the `export FOO=bar`
 *  spelling that its own target parser accepts. Both were found by extracting the logic and
 *  running it against fixtures. So this one starts as a script with a probe seam.
 *
 *  Run: node --test .github/scripts/assert-deployed-env-clean.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, chmodSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), "assert-deployed-env-clean.sh");
const workdir = mkdtempSync(join(tmpdir(), "appcheck-assert-"));

/** A fake `gcloud run services describe`. `responses` maps a service name to what the probe
 *  does for it: `{ env: [...] }` prints that env list, `{ raw }` prints it verbatim (for the
 *  shapes a real parser must reject), `{ fail, stderr }` exits non-zero. */
function probeFor(responses, name) {
  const path = join(workdir, `probe-${name}.sh`);
  const cases = Object.entries(responses)
    .map(([svc, r]) => {
      if (r.fail) {
        return `  ${svc}) printf '%s\\n' ${JSON.stringify(r.stderr ?? "boom")} >&2; exit 1 ;;`;
      }
      const body =
        r.raw ?? JSON.stringify({ spec: { template: { spec: { containers: [{ env: r.env }] } } } });
      return `  ${svc}) cat <<'JSON'\n${body}\nJSON\n  ;;`;
    })
    .join("\n");
  writeFileSync(path, `#!/usr/bin/env bash\ncase "$1" in\n${cases}\n  *) exit 9 ;;\nesac\n`);
  chmodSync(path, 0o755);
  return path;
}

/** Runs the script under a fake probe. Returns `{ status, out }` with stdout and stderr
 *  merged, because GitHub annotations land on both and the caller cares about the text. */
function run(responses, services, name) {
  try {
    const out = execFileSync("bash", [SCRIPT, ...services], {
      env: { ...process.env, ENV_PROBE: probeFor(responses, name) },
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { status: 0, out };
  } catch (e) {
    return { status: e.status, out: `${e.stdout ?? ""}${e.stderr ?? ""}` };
  }
}

/** What a clean gen2 callable actually carries. Firebase sets these; the shape is the Cloud
 *  Run v1 (Knative) `spec.template.spec.containers[0].env` list of `{name, value}`. */
const CLEAN = [
  { name: "FUNCTION_TARGET", value: "describeInvite" },
  { name: "FUNCTION_SIGNATURE_TYPE", value: "http" },
  { name: "LOG_EXECUTION_ID", value: "true" },
];

test("passes when both services are clean", () => {
  const r = run(
    { describeinvite: { env: CLEAN }, redeeminvite: { env: CLEAN } },
    ["describeinvite", "redeeminvite"],
    "clean",
  );
  assert.equal(r.status, 0);
  assert.match(r.out, /ok: describeinvite/);
  assert.match(r.out, /ok: redeeminvite/);
});

test("FAILS on FUNCTIONS_EMULATOR — the variable our own enforcement keys on", () => {
  const r = run(
    { describeinvite: { env: [...CLEAN, { name: "FUNCTIONS_EMULATOR", value: "true" }] } },
    ["describeinvite"],
    "emulator",
  );
  assert.equal(r.status, 1);
  assert.match(r.out, /::error::describeinvite has FUNCTIONS_EMULATOR set/);
  // And it must NOT also print an "ok" line for the same service. That line used to be
  // unconditional, so a dirty service logged both — the exit code was still 1, but a reader
  // scanning the log found the service declared clean by name.
  assert.doesNotMatch(r.out, /ok: describeinvite/);
  // The remedy must name the SERVICE. Nothing in the checkout put this there, so sending the
  // reader to the repo — or to the ENFORCE_APP_CHECK rollback recipe, which is for a
  // different problem entirely — wastes the only minutes that matter.
  assert.match(r.out, /gcloud run services update/);
});

test("FAILS on FIREBASE_DEBUG_MODE, which the cold-start log cannot catch", () => {
  // This one defeats App Check one level below our code: firebase-functions routes the token
  // through `unsafeDecodeAppCheckToken` and accepts an unsigned one, while our own log line
  // still prints enforcement as `true`. Reading the deployed env is the only way to see it.
  const r = run(
    { redeeminvite: { env: [...CLEAN, { name: "FIREBASE_DEBUG_MODE", value: "true" }] } },
    ["redeeminvite"],
    "debugmode",
  );
  assert.equal(r.status, 1);
  assert.match(r.out, /FIREBASE_DEBUG_MODE/);
});

test("FAILS on FIREBASE_DEBUG_FEATURES", () => {
  const r = run(
    {
      redeeminvite: {
        env: [...CLEAN, { name: "FIREBASE_DEBUG_FEATURES", value: "skipTokenVerification" }],
      },
    },
    ["redeeminvite"],
    "debugfeatures",
  );
  assert.equal(r.status, 1);
});

test("flags a banned key even when its value is harmless", () => {
  // `FUNCTIONS_EMULATOR=false` does not disable anything today. It is still flagged: none of
  // these belong on a deployed service at any value, and a check that reasons about values
  // has to track three different consumers' truthiness rules to stay correct.
  const r = run(
    { describeinvite: { env: [...CLEAN, { name: "FUNCTIONS_EMULATOR", value: "false" }] } },
    ["describeinvite"],
    "harmless-value",
  );
  assert.equal(r.status, 1);
});

test("checks EVERY service, not just until the first clean one", () => {
  const r = run(
    {
      describeinvite: { env: CLEAN },
      redeeminvite: { env: [...CLEAN, { name: "FUNCTIONS_EMULATOR", value: "true" }] },
    },
    ["describeinvite", "redeeminvite"],
    "second-dirty",
  );
  assert.equal(r.status, 1);
  assert.match(r.out, /redeeminvite has FUNCTIONS_EMULATOR/);
});

test("FAILS on an EMPTY env list rather than reporting it clean", () => {
  // THE FALSE PASS THIS SCRIPT EXISTS TO CLOSE. The predecessor piped a flattened
  // `--format=value(...)` rendering into grep: a renamed field, a changed rendering or an env
  // list that did not load all produce an empty string, grep matches nothing, and the step
  // prints "clean". A gen2 function always carries env vars, so an empty list means the
  // check stopped working — which must be loud, not green.
  const r = run({ describeinvite: { env: [] } }, ["describeinvite"], "empty");
  assert.equal(r.status, 2);
  assert.match(r.out, /could not parse the deployed env/);
});

test("FAILS when the describe output is not the shape it expects", () => {
  const r = run({ describeinvite: { raw: "not json at all" } }, ["describeinvite"], "garbage");
  assert.equal(r.status, 2);
  assert.match(r.out, /could not parse the deployed env/);
});

test("FAILS when the container has no env key at all", () => {
  const r = run(
    {
      describeinvite: {
        raw: JSON.stringify({ spec: { template: { spec: { containers: [{}] } } } }),
      },
    },
    ["describeinvite"],
    "no-env-key",
  );
  assert.equal(r.status, 2);
});

/** THE REAL not-found output, read out of the installed SDK rather than imagined.
 *
 *  `lib/surface/run/services/describe.py:114` raises
 *  `exceptions.ArgumentError('Cannot find service [{}]')` — reachable because
 *  `command_lib/run/serverless_operations.py` `GetService` returns `None` on
 *  `HttpNotFoundError` — and calliope prints it with the `ERROR: (<command>)` prefix.
 *  Verified against Cloud SDK 577.0.0.
 *
 *  This fixture carried invented text ("NOT_FOUND: Resource not found") in its first version,
 *  and the script's regex was written to match THAT. Both tests below passed while the arm
 *  they cover could never fire against real gcloud — a fixture agreeing with the code about a
 *  third party neither had consulted. The literal stays here, spelled as the tool spells it,
 *  so the next edit to the regex has something real to disagree with. */
const GONE = {
  fail: true,
  stderr: "ERROR: (gcloud.run.services.describe) Cannot find service [describeinvite]",
};

test("FAILS when NO service could be checked, even though each miss is tolerated", () => {
  // THE FAIL-OPEN THE PER-SERVICE TOLERANCE OPENS, found by the security review. `region`
  // defaults to us-central1 on the script's own stated assumption that beacon sets no region
  // and calls no setGlobalOptions. The day a callable gets one, BOTH describes return
  // NOT_FOUND, every miss is tolerated, and the deploy goes green having verified nothing —
  // the exact "guard that gates nothing" this branch exists to remove.
  //
  // Tolerating ONE absent service is still right: it says nothing about the other. Verifying
  // NOTHING is not a tolerable outcome, it is the check having silently stopped running.
  const r = run(
    { describeinvite: GONE, redeeminvite: GONE },
    ["describeinvite", "redeeminvite"],
    "all-gone",
  );
  assert.equal(r.status, 2);
  assert.match(r.out, /no service was actually checked/i);
});

test("TOLERATES a missing service, and says the env was not checked", () => {
  // The one condition that is not this check's business: if the service does not exist there
  // is no deployed env to read, and the deploy itself is what to look at. Warned, not failed.
  const r = run(
    { describeinvite: GONE, redeeminvite: { env: CLEAN } },
    ["describeinvite", "redeeminvite"],
    "notfound",
  );
  assert.equal(r.status, 0);
  assert.match(r.out, /::warning::describeinvite does not exist/);
  assert.match(r.out, /NOT checked/);
  // Paired with a service that WAS read: one absent service says nothing about the other, so
  // the run still verified something. The all-absent case above is the one that did not.
  assert.match(r.out, /ok: redeeminvite/);
});

test("FAILS on a permission error instead of tolerating it", () => {
  // The distinction the whole failure arm turns on. A revoked role or an API outage must not
  // be swallowed by the missing-service tolerance, or this assertion goes permanently silent
  // under a green check — the precise failure mode it replaces.
  //
  // A WRONG REGION is deliberately NOT in that list, though an earlier version of this comment
  // claimed it was: a wrong region surfaces as NOT_FOUND, which this arm tolerates. It is
  // caught by the all-absent rule two tests up instead — which is the only thing that can
  // catch it, since every service looks equally missing from the wrong region.
  const r = run(
    {
      describeinvite: {
        fail: true,
        stderr:
          "ERROR: (gcloud.run.services.describe) PERMISSION_DENIED: roles/run.viewer required",
      },
    },
    ["describeinvite"],
    "denied",
  );
  assert.equal(r.status, 2);
  assert.match(r.out, /this assertion did NOT run/);
});

test("FAILS when given no services, rather than passing vacuously", () => {
  const r = run({}, [], "no-args");
  assert.equal(r.status, 2);
});
