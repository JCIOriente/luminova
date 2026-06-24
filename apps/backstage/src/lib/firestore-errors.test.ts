import { describe, expect, it } from "vitest";
import { FirebaseError } from "firebase/app";
import { isPermissionDenied } from "./firestore-errors";

describe("isPermissionDenied", () => {
  it("is true for a Firestore permission-denied error", () => {
    const err = new FirebaseError("permission-denied", "Missing or insufficient permissions.");
    expect(isPermissionDenied(err)).toBe(true);
  });

  it("is false for other Firebase error codes", () => {
    expect(isPermissionDenied(new FirebaseError("unavailable", "x"))).toBe(false);
    expect(isPermissionDenied(new FirebaseError("not-found", "x"))).toBe(false);
  });

  it("is false for non-Firebase errors", () => {
    expect(isPermissionDenied(new Error("permission-denied"))).toBe(false);
    expect(isPermissionDenied(null)).toBe(false);
    expect(isPermissionDenied(undefined)).toBe(false);
  });
});
