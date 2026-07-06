import { describe, expect, it } from "vitest";
import { FirebaseError } from "firebase/app";
import { retryQuery } from "./query-retry";
import { DocParseError } from "./firestore-read";

const permissionDenied = new FirebaseError(
  "permission-denied",
  "Missing or insufficient permissions.",
);
const docParse = new DocParseError("members", "abc123", []);
const transient = new FirebaseError("unavailable", "The service is currently unavailable.");

describe("retryQuery", () => {
  it("never retries a permission-denied rejection", () => {
    expect(retryQuery(0, permissionDenied)).toBe(false);
    expect(retryQuery(5, permissionDenied)).toBe(false);
  });

  it("never retries a DocParseError", () => {
    expect(retryQuery(0, docParse)).toBe(false);
    expect(retryQuery(5, docParse)).toBe(false);
  });

  it("retries a transient error exactly once", () => {
    expect(retryQuery(0, transient)).toBe(true);
    expect(retryQuery(1, transient)).toBe(false);
  });

  it("retries an unknown/non-Firebase error once then stops", () => {
    const unknown = new Error("network blip");
    expect(retryQuery(0, unknown)).toBe(true);
    expect(retryQuery(1, unknown)).toBe(false);
  });
});
