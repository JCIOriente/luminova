import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (rel) => readFileSync(new URL(`../../../${rel}`, import.meta.url), "utf8");

const budgets = Object.fromEntries(
  read("tools/scripts/bundle-budgets.env")
    .split("\n")
    .filter((l) => /^[A-Z_]+=\d+$/.test(l))
    .map((l) => l.split("=")),
);

test("the env file defines every budget", () => {
  for (const key of [
    "SPOTLIGHT_EAGER_JS_KB",
    "SPOTLIGHT_INDEX_CSS_KB",
    "BACKSTAGE_EAGER_JS_KB",
    "BACKSTAGE_INDEX_CSS_KB",
    "ROUTE_CHUNK_KB",
  ]) {
    assert.match(budgets[key] ?? "", /^\d+$/, key);
  }
});

test("docs/performance.md budget table matches the env file", () => {
  const rows = Object.fromEntries(
    read("docs/performance.md")
      .split("\n")
      .filter((l) => /^\| (Eager JS|Initial CSS|Any single route chunk)/.test(l))
      .map((l) => [l.split("|")[1].trim().split(" ")[0], l.split("|").slice(2, 4)]),
  );
  const budgetOf = (cell) => cell.match(/≤ \**(\d+) kB/)?.[1];
  assert.equal(budgetOf(rows.Eager[0]), budgets.SPOTLIGHT_EAGER_JS_KB);
  assert.equal(budgetOf(rows.Eager[1]), budgets.BACKSTAGE_EAGER_JS_KB);
  assert.equal(budgetOf(rows.Initial[0]), budgets.SPOTLIGHT_INDEX_CSS_KB);
  assert.equal(budgetOf(rows.Initial[1]), budgets.BACKSTAGE_INDEX_CSS_KB);
  assert.equal(budgetOf(rows.Any[0]), budgets.ROUTE_CHUNK_KB);
  assert.equal(budgetOf(rows.Any[1]), budgets.ROUTE_CHUNK_KB);
});

test("app CLAUDE.md files state the same budgets", () => {
  const spotlight = read("apps/spotlight/CLAUDE.md");
  assert.match(spotlight, new RegExp(`eager JS ≤ ${budgets.SPOTLIGHT_EAGER_JS_KB} kB`));
  assert.match(spotlight, new RegExp(`index CSS ≤ ${budgets.SPOTLIGHT_INDEX_CSS_KB} kB`));
  assert.match(spotlight, new RegExp(`route chunk ≤ ${budgets.ROUTE_CHUNK_KB} kB`));
  const backstage = read("apps/backstage/CLAUDE.md");
  assert.match(
    backstage,
    new RegExp(`eager JS \\(entry \\+ modulepreloads\\) ≤ ${budgets.BACKSTAGE_EAGER_JS_KB} kB`),
  );
  assert.match(backstage, new RegExp(`CSS ≤ ${budgets.BACKSTAGE_INDEX_CSS_KB} kB`));
});
