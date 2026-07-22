import { describe, expect, it } from "vitest";
import { parseAudience, memberQueryFilter, includesAnonTokens } from "./audience.js";

describe("parseAudience", () => {
  it("returns null on a malformed audience", () => {
    expect(parseAudience({ type: "bogus" })).toBeNull();
    expect(parseAudience({ type: "role" })).toBeNull(); // missing roleId
    expect(parseAudience(undefined)).toBeNull();
  });
  it("parses each valid shape", () => {
    expect(parseAudience({ type: "everyone" })).toEqual({ type: "everyone" });
    expect(parseAudience({ type: "members" })).toEqual({ type: "members" });
    expect(parseAudience({ type: "role", roleId: "r1" })).toEqual({ type: "role", roleId: "r1" });
  });
});

describe("memberQueryFilter", () => {
  it("no role filter for everyone/members", () => {
    expect(memberQueryFilter({ type: "everyone" })).toBeNull();
    expect(memberQueryFilter({ type: "members" })).toBeNull();
  });
  it("array-contains roleId for a role audience", () => {
    expect(memberQueryFilter({ type: "role", roleId: "r1" })).toEqual({
      field: "roleIds",
      op: "array-contains",
      value: "r1",
    });
  });
});

describe("includesAnonTokens", () => {
  it("only everyone reaches anonymous pushTokens", () => {
    expect(includesAnonTokens({ type: "everyone" })).toBe(true);
    expect(includesAnonTokens({ type: "members" })).toBe(false);
    expect(includesAnonTokens({ type: "role", roleId: "r1" })).toBe(false);
  });
});
