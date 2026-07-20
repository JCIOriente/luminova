import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { ROUTE_GATING } from "../../apps/backstage/src/components/nav-config";

// Reverse-coverage / orphan detector. Extracts the COLLECTION NAMES from firestore.rules
// (a lexical scrape of `match /X/{…}` segments — it makes NO claim about what any allow-arm
// authorizes, unlike the rejected regex-parse-authz design) and asserts every one is either
// surfaced by a nav route (ROUTE_GATING) or explicitly declared unsurfaced with a reason.
// This catches "correct-but-unused" rules arms (audit C8) that an arm-equality check can't.
// No emulator needed — pure source + ROUTE_GATING.

const RULES_SOURCE = readFileSync(
  resolve(fileURLToPath(new URL("../../firestore.rules", import.meta.url))),
  "utf8",
);

// First path segment after `match /`. The charset covers every legal Firestore collection
// id character (letters, digits, `_`, `-`) so a future `match /point_rules/{id}` can't slip
// past the orphan guard; the `{document=**}` wildcards start with `{` and are excluded.
const STRUCTURAL = new Set(["databases"]); // `match /databases/{database}/documents`
const collections = new Set(
  [...RULES_SOURCE.matchAll(/match\s+\/([A-Za-z][A-Za-z0-9_-]*)/g)]
    .map((m) => m[1]!)
    .filter((c) => !STRUCTURAL.has(c)),
);

const surfaced = new Set<string>();
for (const probe of Object.values(ROUTE_GATING)) {
  if (!probe) continue;
  if (probe.kind === "curationOnly") probe.collections.forEach((c) => surfaced.add(c));
  else surfaced.add(probe.collection);
}

// Collections that are intentionally not their own nav route — each with a one-line reason.
const KNOWN_UNSURFACED: Record<string, string> = {
  terms: "read-only term ledger; shown inside pages, not a route",
  checkIns: "written by the check-in flow inside /activities detail; not a top-level route",
  participations: "engine-owned ledger, read-only; shown inside member detail",
  memberPoints: "engine-owned points ledger, read-only; shown inside /me + /leaderboard",
  showcase: "public spotlight projection (read:true), beacon-written; no backstage route",
  allyShowcase: "public spotlight projection (read:true), beacon-written; no backstage route",
  events:
    "ORPHAN — live create/update:Event arms with no consumer (audit C8); rules block removed in PR-D",
};

describe("rules coverage: no orphaned firestore.rules collection", () => {
  it("every rules collection is surfaced by a route or explicitly declared unsurfaced", () => {
    const unaccounted = [...collections]
      .filter((c) => !surfaced.has(c) && !(c in KNOWN_UNSURFACED))
      .sort();
    expect(
      unaccounted,
      `unaccounted rules collections (orphan, or missing a ROUTE_GATING entry): ${unaccounted.join(", ")}`,
    ).toEqual([]);
  });

  it("KNOWN_UNSURFACED has no stale entries — a removed collection must leave the allowlist too", () => {
    const stale = Object.keys(KNOWN_UNSURFACED)
      .filter((c) => !collections.has(c))
      .sort();
    expect(
      stale,
      `KNOWN_UNSURFACED lists collections not in firestore.rules: ${stale.join(", ")}`,
    ).toEqual([]);
  });

  it("ROUTE_GATING references only real rules collections", () => {
    const bogus = [...surfaced].filter((c) => !collections.has(c)).sort();
    expect(
      bogus,
      `ROUTE_GATING names collections absent from firestore.rules: ${bogus.join(", ")}`,
    ).toEqual([]);
  });
});
