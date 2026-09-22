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
    "predeploy no longer builds beacon, so dist is no longer guaranteed freshly built",
  );
});

test("apps/beacon/build.mjs still wipes dist before building", () => {
  // Deliberately a narrow check on the one statement that matters, not a scan for "safe-looking
  // code". If this ever needs loosening, the honest move is to delete the claims it supports.
  const build = readFileSync(join(repo, "apps/beacon/build.mjs"), "utf8");
  assert.match(
    build,
    /rm\(dist, \{ recursive: true, force: true \}\)/,
    "build.mjs no longer wipes dist, so a cached or committed apps/beacon/dist/.env* could " +
      "survive into the deployed bundle — the guards say it cannot",
  );
});
