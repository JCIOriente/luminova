/** The two facts that make a committed beacon dotenv unable to reach production.
 *
 *  Every claim in `assert-no-dotenv-override.sh`, in `ci.yml`'s guard step and in
 *  `docs/firebase-setup.md` rests on this pair, and nothing was checking either one:
 *
 *    1. firebase.json declares the functions SOURCE as `apps/beacon/dist` — so
 *       `apps/beacon/.env*`, the only file a repo grep can see in CI, is a directory
 *       firebase-tools never reads for this project.
 *    2. `apps/beacon/build.mjs` wipes that dist before every build, and `predeploy` runs the
 *       build — so nothing committed or cached can survive into the deployed bundle.
 *
 *  Change either and the file vector goes LIVE while three files still say it cannot. That is
 *  the claim==reality failure (guardrail #6) the surrounding work exists to remove, so it is
 *  pinned here rather than left as prose. These assertions are the reason the grep is allowed
 *  to be a hygiene signal instead of a control.
 *
 *  Run: node --test .github/scripts/dotenv-vector-invariants.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const repo = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

test("firebase.json still deploys functions from apps/beacon/dist", () => {
  // Parsed, not grepped: the value is what firebase-tools resolves the dotenv directory from
  // (`env.js` uses `opts.configDir || opts.functionsSource`).
  const config = JSON.parse(readFileSync(join(repo, "firebase.json"), "utf8"));
  const beacon = config.functions.find((f) => f.codebase === "beacon");
  assert.ok(beacon, "no functions codebase named 'beacon' in firebase.json");
  assert.equal(
    beacon.source,
    "apps/beacon/dist",
    "the functions source moved — apps/beacon/.env* may now be READ at deploy time, which " +
      "makes the committed-dotenv vector live. Re-read the guard comments in ci.yml and " +
      "assert-no-dotenv-override.sh before changing this.",
  );
  // The build that wipes dist must actually be the thing that runs before a deploy.
  assert.match(
    (beacon.predeploy ?? []).join(" "),
    /turbo run build --filter beacon/,
    "predeploy no longer builds beacon, so the deploy may ship a dist nothing in this repo " +
      "produced. Note this pins that a BUILD runs, not that it runs from scratch — a turbo " +
      "cache hit restores dist/** without executing build.mjs, which is exactly the vector " +
      "the post-deploy assertion in deploy.yml exists to cover.",
  );
});

test("a dotenv cannot be COMMITTED at the path firebase-tools deploys from", () => {
  // Asks git, which is the authority on this, rather than reading .gitignore as text. An
  // earlier version of this test matched a regex against build.mjs's `rm(dist, …)` line — and
  // a source-text guard is precisely what this repo has been bitten by three times: it would
  // have kept passing if that line were commented out or moved below the build.
  //
  // This is the half of the invariant that is machine-checkable. `git check-ignore` exits 0
  // only if the path is ignored, so `apps/beacon/dist/.env` cannot enter a commit without a
  // deliberate `git add -f` — which is why the CI grep's dist arm has nothing to find there.
  const ignored = (path) => {
    try {
      execFileSync("git", ["check-ignore", "-q", path], { cwd: repo, stdio: "ignore" });
      return true;
    } catch {
      return false;
    }
  };
  assert.ok(
    ignored("apps/beacon/dist/.env"),
    "apps/beacon/dist is no longer gitignored, so a dotenv can now be committed at the exact " +
      "path firebase-tools deploys from. The guard comments in ci.yml and " +
      "assert-no-dotenv-override.sh say that is impossible — fix one or the other.",
  );

  // THE OTHER HALF IS NOT CHECKED HERE, said plainly rather than faked. `build.mjs` wiping
  // dist is what stops a turbo CACHE RESTORE reintroducing a file, and verifying that honestly
  // means running the real build and observing a sentinel disappear — which would have this
  // test clobbering apps/beacon/dist as a side effect, in a suite that runs after the build in
  // CI. Not worth that trade for a vector no cache in CI can currently reach. If a turbo cache
  // is ever configured for CI, this is the test to come back to.
});
