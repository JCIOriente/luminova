import { describe, it, expect } from "vitest";
import { PROVISION_BLOCK_REASONS } from "./provision-block-reason.js";

describe("PROVISION_BLOCK_REASONS", () => {
  it("carries no duplicate tag", () => {
    // A duplicate is invisible to both consumers: the union collapses it, so backstage's
    // message table stays exhaustive with one message missing and beacon still compiles.
    expect(new Set(PROVISION_BLOCK_REASONS).size).toBe(PROVISION_BLOCK_REASONS.length);
  });

  it("keeps every tag a stable wire token", () => {
    // These cross the callable boundary inside `details.reason` and are compared byte-for-byte
    // by the client. Lowercase kebab with no spaces or punctuation keeps them safe to log,
    // JSON round-trip and eyeball in an error payload.
    for (const reason of PROVISION_BLOCK_REASONS) {
      expect(reason).toMatch(/^[a-z]+(?:-[a-z]+)*$/);
    }
  });
});
