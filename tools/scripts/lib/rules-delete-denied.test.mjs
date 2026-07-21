import { test } from "node:test";
import assert from "node:assert/strict";
import { parseDeleteDeniedCollections } from "./rules-delete-denied.mjs";

const FIXTURE = `
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    function signedIn() { return request.auth != null; }

    match /projects/{projectId} {
      allow read: if signedIn();
      allow delete: if false;
    }
    match /allies/{allyId} {
      allow update: if canDo('update','Ally');
      allow delete: if false;
    }
    match /memberPoints/{document=**} {
      allow read: if signedIn();
      allow write: if false;
    }
    match /checkIns/{checkInId} {
      allow update: if false;
      allow delete: if withinCheckInWindow(id);
    }
    match /siteConfig/current {
      allow read: if true;
      allow write: if hasAnyRole(['Admin']);
    }
    match /{document=**} {
      allow read, write: if false;
    }
  }
}
`;

test("collects collections whose delete is a flat deny (delete:false or write:false)", () => {
  assert.deepEqual(parseDeleteDeniedCollections(FIXTURE), ["allies", "memberPoints", "projects"]);
});

test("excludes a collection whose delete is conditional (checkIns update:false ≠ delete deny)", () => {
  assert.equal(parseDeleteDeniedCollections(FIXTURE).includes("checkIns"), false);
});

test("excludes the catch-all default-deny and the Admin-writable siteConfig", () => {
  const got = parseDeleteDeniedCollections(FIXTURE);
  assert.equal(got.includes("siteConfig"), false);
  assert.equal(got.includes("document"), false);
  assert.equal(
    got.some((c) => c.includes("{")),
    false,
  );
});

test("misattributes nothing to the catch-all's previous collection", () => {
  // Regression: a line-scanner that doesn't null `current` on `match /{document=**}` would
  // attribute the catch-all's `write: if false` to the last real collection.
  assert.deepEqual(parseDeleteDeniedCollections(FIXTURE), ["allies", "memberPoints", "projects"]);
});
