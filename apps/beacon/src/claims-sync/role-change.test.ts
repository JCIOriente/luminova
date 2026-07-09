import { describe, expect, it } from "vitest";
import { roleClaimsChanged } from "./role-change.js";

describe("roleClaimsChanged", () => {
  it("is true on create (no before)", () => {
    expect(roleClaimsChanged(undefined, { permissions: ["read:Member"] })).toBe(true);
  });

  it("is true on delete (no after)", () => {
    expect(roleClaimsChanged({ permissions: ["read:Member"] }, undefined)).toBe(true);
  });

  it("is false for a metadata-only edit (name changed, perms/active unchanged)", () => {
    const before = { name: "Editor", permissions: ["read:Member"], active: true };
    const after = { name: "Redactor", permissions: ["read:Member"], active: true };
    expect(roleClaimsChanged(before, after)).toBe(false);
  });

  it("is true when the permission set changes", () => {
    const before = { permissions: ["read:Member"] };
    const after = { permissions: ["read:Member", "manage:Member"] };
    expect(roleClaimsChanged(before, after)).toBe(true);
  });

  it("is false when permissions are merely reordered (same set)", () => {
    const before = { permissions: ["read:Member", "manage:Member"] };
    const after = { permissions: ["manage:Member", "read:Member"] };
    expect(roleClaimsChanged(before, after)).toBe(false);
  });

  it("is true when a permission is revoked but a duplicate keeps array length equal", () => {
    // ["read","manage"] -> ["read","read"] drops manage:Member; length stays 2, so
    // an array-wise compare would wrongly read it as unchanged.
    const before = { permissions: ["read:Member", "manage:Member"] };
    const after = { permissions: ["read:Member", "read:Member"] };
    expect(roleClaimsChanged(before, after)).toBe(true);
  });

  it("is true when the builtIn flag flips on an active role", () => {
    const before = { permissions: ["read:Member"], builtInKey: "Admin", builtIn: true };
    const after = { permissions: ["read:Member"], builtInKey: "Admin", builtIn: false };
    expect(roleClaimsChanged(before, after)).toBe(true);
  });

  it("is true when the role is deactivated (active flips)", () => {
    const before = { permissions: ["read:Member"], active: true };
    const after = { permissions: ["read:Member"], active: false };
    expect(roleClaimsChanged(before, after)).toBe(true);
  });

  it("is true when the role is soft-deleted (deletedAt set)", () => {
    const before = { permissions: ["read:Member"], deletedAt: null };
    const after = { permissions: ["read:Member"], deletedAt: { seconds: 1 } };
    expect(roleClaimsChanged(before, after)).toBe(true);
  });

  it("is true when builtInKey changes (scan target switches)", () => {
    const before = { permissions: ["read:Member"], builtInKey: "Member" };
    const after = { permissions: ["read:Member"], builtInKey: "Admin" };
    expect(roleClaimsChanged(before, after)).toBe(true);
  });

  it("is false when an already-inactive role's perms change (contributes nothing either way)", () => {
    const before = { permissions: ["read:Member"], active: false };
    const after = { permissions: ["manage:Member"], active: false };
    expect(roleClaimsChanged(before, after)).toBe(false);
  });
});
