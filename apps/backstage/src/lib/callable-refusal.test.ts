import { describe, expect, it } from "vitest";
import { refusalMessage } from "./callable-refusal";

const TABLE = new Map<string, string>([["known-reason", "Mensaje conocido."]]);

describe("refusalMessage", () => {
  it("returns the table's message for a tagged refusal", () => {
    expect(refusalMessage({ details: { reason: "known-reason" } }, TABLE)).toBe(
      "Mensaje conocido.",
    );
  });

  it("returns null when the callable did not tag the failure", () => {
    // A transient failure — App Check, quota, config — or a reason this build does not know.
    // The caller decides what to say next; it must be able to tell the two apart.
    expect(refusalMessage(new Error("network"), TABLE)).toBeNull();
    expect(refusalMessage({ details: {} }, TABLE)).toBeNull();
    expect(refusalMessage({ details: null }, TABLE)).toBeNull();
    expect(refusalMessage({ details: "nope" }, TABLE)).toBeNull();
    expect(refusalMessage({ details: { reason: 7 } }, TABLE)).toBeNull();
    expect(refusalMessage(null, TABLE)).toBeNull();
    expect(refusalMessage(undefined, TABLE)).toBeNull();
    expect(refusalMessage({ details: { reason: "unknown-to-this-build" } }, TABLE)).toBeNull();
  });

  it.each(["toString", "constructor", "valueOf", "__proto__", "hasOwnProperty"])(
    "is prototype-safe for %s",
    (reason) => {
      // `reason` is attacker-adjacent: it arrives inside the callable's error payload. A plain
      // object lookup resolves these to the inherited Object.prototype FUNCTION, which
      // `?? fallback` then happily returns as the message — TypeScript types it `string` and
      // React would render a function. A Map has no prototype chain to walk.
      expect(refusalMessage({ details: { reason } }, TABLE)).toBeNull();
    },
  );
});
