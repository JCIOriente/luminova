// Fixture tests for the review router. Run: node --test .claude/hooks/
// These are the acceptance cases from the routing contract — each asserts the
// EXACT token set, so a rubric edit that silently widens or drops a class fails
// here instead of in a PR that skipped a review.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROUTER = join(dirname(fileURLToPath(import.meta.url)), "review-route.mjs");

/** files: [path, added, removed] */
function route(files, args = []) {
  const numstat = files.map(([p, a = 20, r = 0]) => `${a}\t${r}\t${p}`).join("\n");
  return JSON.parse(execFileSync("node", [ROUTER, ...args], { input: numstat, encoding: "utf8" }));
}
const tokens = (files, args) =>
  route(files, args)
    .reviews.map((r) => r.token)
    .sort();

test("firestore.rules → security class, hard-gated", () => {
  const t = tokens([["firestore.rules", 30, 4]]);
  assert.ok(t.includes("security-review"));
  assert.ok(t.includes("firestore-security-reviewer"));
  assert.deepEqual(tokens([["firestore.rules", 30, 4]], ["--gate-only"]), ["security-review"]);
});

test("beacon function → security-review + functions reviewer, not firestore reviewer", () => {
  const t = tokens([["apps/beacon/src/set-user-roles.ts", 40, 10]]);
  assert.ok(t.includes("security-review"));
  assert.ok(t.includes("firebase-functions-reviewer"));
  assert.ok(!t.includes("firestore-security-reviewer"));
});

test("feature .tsx diff → code-review, simplify, react-best-practices; no security", () => {
  const t = tokens([["apps/backstage/src/features/members/components/member-table.tsx", 60, 12]]);
  assert.deepEqual(t, ["code-review", "react-best-practices", "simplify"]);
});

test("test-only diff → lighter review, zero reviews", () => {
  const r = route([
    ["apps/backstage/src/features/members/hooks/use-members.test.ts", 80, 0],
    ["packages/rules-test/src/members.test.ts", 40, 2],
  ]);
  assert.equal(r.verdict, "lighter");
  assert.deepEqual(r.reviews, []);
});

test("docs-only diff → lighter review", () => {
  assert.equal(route([["docs/engineering-guardrails.md", 30, 1]]).verdict, "lighter");
});

test("a rules TEST alone does not trip the security gate", () => {
  assert.deepEqual(
    tokens([["packages/rules-test/src/members.test.ts", 50, 0]], ["--gate-only"]),
    [],
  );
});

test("tiny source tweak → no reviews, but verdict `minor` (still owes an exception)", () => {
  const r = route([["apps/spotlight/src/lib/format.ts", 3, 2]]);
  assert.deepEqual(r.reviews, []);
  assert.equal(r.verdict, "minor");
});

test("a `minor` verdict still demands Review-Exception in the text output", () => {
  const out = execFileSync("node", [ROUTER, "--format", "text"], {
    input: "3\t2\tapps/spotlight/src/lib/format.ts",
    encoding: "utf8",
  });
  assert.match(out, /Review-Exception/);
  assert.doesNotMatch(out, /MUST get 0 review/);
});

test("editing the gate or the rubric is itself security-sensitive", () => {
  for (const p of [
    ".claude/hooks/review-gate.sh",
    ".claude/hooks/review-route.mjs",
    ".claude/review-routing.json",
    ".claude/settings.json",
  ]) {
    assert.deepEqual(tokens([[p, 20, 5]], ["--gate-only"]), ["security-review"], p);
  }
});

test("code-review carries its user-invocation-only note into the checklist", () => {
  const out = execFileSync("node", [ROUTER, "--format", "text"], {
    input: "60\t12\tapps/backstage/src/features/x/thing.ts",
    encoding: "utf8",
  });
  assert.match(out, /note: \/code-review is user-invocation-only/);
});

test("tools/scripts is product source, not an unrouted blind spot", () => {
  assert.ok(tokens([["tools/scripts/lib/role-seed.mjs", 30, 5]]).includes("code-review"));
});

test("dependency change → secure-dep-vetting + bundle-budget-watcher", () => {
  const t = tokens([
    ["package.json", 2, 1],
    ["pnpm-lock.yaml", 40, 8],
  ]);
  assert.ok(t.includes("secure-dep-vetting"));
  assert.ok(t.includes("bundle-budget-watcher"));
});

test("new route file → bundle-budget-watcher", () => {
  assert.ok(
    tokens([["apps/spotlight/src/routes/impacto.$id.tsx", 120, 0]]).includes(
      "bundle-budget-watcher",
    ),
  );
});

test("large frontend module without a route or dep still trips the budget watcher", () => {
  const t = tokens([["packages/ui/src/components/data-table.tsx", 260, 5]]);
  assert.ok(t.includes("bundle-budget-watcher"));
});

test("repository change routes to security even outside backstage routes", () => {
  const t = tokens([
    ["apps/backstage/src/features/members/repositories/member-repository.ts", 25, 3],
  ]);
  assert.ok(t.includes("security-review"));
  assert.ok(t.includes("firestore-security-reviewer"));
});

test("rename INTO a sensitive path is routed (both sides of the rename count)", () => {
  const numstat = "10\t0\tapps/backstage/src/features/x/{lib => repositories}/thing.ts";
  const r = JSON.parse(
    execFileSync("node", [ROUTER, "--gate-only"], { input: numstat, encoding: "utf8" }),
  );
  assert.deepEqual(
    r.reviews.map((x) => x.token),
    ["security-review"],
  );
});

test("a C-quoted non-ASCII path still routes (gate must not fail open)", () => {
  // git core.quotePath=true renders `apps/beacon/src/índex.ts` like this. The
  // leading quote used to defeat every `^`-anchored rule => silent bypass.
  const numstat = '1\t0\t"apps/beacon/src/\\303\\255ndex.ts"';
  const r = JSON.parse(
    execFileSync("node", [ROUTER, "--gate-only"], { input: numstat, encoding: "utf8" }),
  );
  assert.deepEqual(
    r.reviews.map((x) => x.token),
    ["security-review"],
  );
});

test("quoted path decodes to the real name, escapes and all", () => {
  const numstat = '1\t0\t"packages/auth/src/a\\tb\\"c.ts"';
  const r = JSON.parse(execFileSync("node", [ROUTER], { input: numstat, encoding: "utf8" }));
  assert.ok(r.reviews.find((x) => x.token === "security-review"));
  assert.deepEqual(r.reviews[0].triggeredBy, ['packages/auth/src/a\tb"c.ts']);
});

test("a quoted path renamed INTO a sensitive dir routes too", () => {
  const numstat = '10\t0\t"apps/backstage/src/features/x/{lib => repositories}/\\303\\261.ts"';
  const r = JSON.parse(
    execFileSync("node", [ROUTER, "--gate-only"], { input: numstat, encoding: "utf8" }),
  );
  assert.deepEqual(
    r.reviews.map((x) => x.token),
    ["security-review"],
  );
});

test("an unquoted path containing a literal quote is not mangled", () => {
  const r = route([['apps/spotlight/src/a"b.tsx', 30, 0]]);
  assert.ok(r.reviews.find((x) => x.token === "react-best-practices"));
});

test("a `tests/` dir inside deployable code is NOT exempt from the hard gate", () => {
  // apps/beacon/src/tests/helper.ts ships to Cloud Functions; only top-level
  // suites and *.test.* files are tests.
  assert.deepEqual(tokens([["apps/beacon/src/tests/helper.ts", 40, 0]], ["--gate-only"]), [
    "security-review",
  ]);
  assert.deepEqual(tokens([["tests/firestore-rules/rules.test.ts", 40, 0]], ["--gate-only"]), []);
});

test("editing _hooklib.sh is hard-gated — it can disable the gate", () => {
  for (const p of [".claude/hooks/_hooklib.sh", ".claude/hooks/route.sh"]) {
    assert.deepEqual(tokens([[p, 20, 5]], ["--gate-only"]), ["security-review"], p);
  }
});

test("the LAST --format wins, so an appended --format tokens is authoritative", () => {
  const out = execFileSync(
    "node",
    [ROUTER, "--format", "text", "--gate-only", "--format", "tokens"],
    {
      input: "30\t4\tfirestore.rules",
      encoding: "utf8",
    },
  );
  assert.equal(out, "security-review");
});

test("binary file (numstat `-`) contributes 0 changed lines, does not crash", () => {
  const numstat = "-\t-\tapps/spotlight/public/hero.webp";
  const r = JSON.parse(execFileSync("node", [ROUTER], { input: numstat, encoding: "utf8" }));
  assert.equal(r.files, 1);
  assert.deepEqual(r.reviews, []);
});

test("empty diff → verdict `empty`, no reviews (nothing to except)", () => {
  const r = JSON.parse(execFileSync("node", [ROUTER], { input: "", encoding: "utf8" }));
  assert.equal(r.verdict, "empty");
  assert.deepEqual(r.reviews, []);
});

test("--gate-only keeps verdict and reviews consistent (no advisory-only `routed` with []) ", () => {
  // .tsx-only diff trips advisory rules but nothing hard.
  const r = route([["apps/backstage/src/features/x/thing.tsx", 60, 3]], ["--gate-only"]);
  assert.deepEqual(r.reviews, []);
  assert.equal(r.verdict, "minor");
});

test("--format tokens emits one token per line (no second JSON parse needed)", () => {
  const out = execFileSync("node", [ROUTER, "--gate-only", "--format", "tokens"], {
    input: "30\t4\tfirestore.rules",
    encoding: "utf8",
  });
  assert.equal(out, "security-review");
});

test("--trailer-keys reports the rubric vocabulary, current key first", () => {
  const out = execFileSync("node", [ROUTER, "--trailer-keys"], { encoding: "utf8" });
  assert.deepEqual(out.split("\n"), ["Reviews", "Security-Reviewed"]);
});

test("text output names the exact skills and the stamp command", () => {
  const numstat = "30\t4\tfirestore.rules";
  const out = execFileSync("node", [ROUTER, "--format", "text"], {
    input: numstat,
    encoding: "utf8",
  });
  assert.match(out, /\/security-review/);
  assert.match(out, /firestore-security-reviewer/);
  assert.match(out, /Reviews: <HEAD-sha>/);
});

test("lighter-review text demands the Review-Exception line", () => {
  const out = execFileSync("node", [ROUTER, "--format", "text"], {
    input: "10\t0\tdocs/x.md",
    encoding: "utf8",
  });
  assert.match(out, /Review-Exception/);
});
