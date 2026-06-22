import { describe, it, expect } from "vitest";
import {
  ACTIONS,
  SUBJECTS,
  ALL_PERMISSION_CODES,
  isValidPermissionCode,
  PERMISSION_CAP,
} from "./permission.js";

describe("permission vocabulary", () => {
  it("accepts well-formed codes", () => {
    expect(isValidPermissionCode("manage:Member")).toBe(true);
    expect(isValidPermissionCode("read:Payment")).toBe(true);
    expect(isValidPermissionCode("manage:all")).toBe(true);
    expect(isValidPermissionCode("checkIn:Attendance")).toBe(true);
  });

  it("rejects malformed or unknown codes", () => {
    expect(isValidPermissionCode("bogus:Member")).toBe(false);
    expect(isValidPermissionCode("manage:Nope")).toBe(false);
    expect(isValidPermissionCode("manage")).toBe(false);
    expect(isValidPermissionCode(42)).toBe(false);
    expect(isValidPermissionCode(null)).toBe(false);
  });

  it("enumerates every action×subject without duplicates", () => {
    expect(ALL_PERMISSION_CODES.length).toBe(ACTIONS.length * SUBJECTS.length);
    expect(new Set(ALL_PERMISSION_CODES).size).toBe(ALL_PERMISSION_CODES.length);
  });

  it("caps effective perms at 30", () => {
    expect(PERMISSION_CAP).toBe(30);
  });
});
