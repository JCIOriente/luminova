import { test } from "node:test";
import assert from "node:assert/strict";
import { collectionNameFromMatchLine } from "./rules-collections.mjs";

test("extracts the collection name from a standard match line", () => {
  assert.equal(collectionNameFromMatchLine("    match /projects/{projectId} {"), "projects");
  assert.equal(collectionNameFromMatchLine("    match /siteConfig/current {"), "siteConfig");
  assert.equal(
    collectionNameFromMatchLine("    match /memberPoints/{document=**} {"),
    "memberPoints",
  );
});

test("supports hyphenated collection ids (charset parity with the orphan guard)", () => {
  assert.equal(collectionNameFromMatchLine("    match /point-rules/{id} {"), "point-rules");
});

test("returns the structural documents-root name for callers to exclude", () => {
  assert.equal(
    collectionNameFromMatchLine("  match /databases/{database}/documents {"),
    "databases",
  );
});

test("returns null for the catch-all wildcard and non-match lines", () => {
  assert.equal(collectionNameFromMatchLine("    match /{document=**} {"), null);
  assert.equal(collectionNameFromMatchLine("      allow delete: if false;"), null);
  assert.equal(collectionNameFromMatchLine("    function signedIn() {"), null);
  assert.equal(collectionNameFromMatchLine(""), null);
});
