import { describe, it, expect } from "vitest";
import {
  validateProvisionInput,
  nextClaims,
  provisionMember,
  type ProvisionDeps,
} from "./provision-member-login";

describe("validateProvisionInput", () => {
  it("accepts a clean memberId", () => {
    expect(validateProvisionInput({ memberId: "m-1" })).toEqual({ memberId: "m-1" });
  });
  it("rejects missing / empty / unclean memberId", () => {
    expect(() => validateProvisionInput({})).toThrow();
    expect(() => validateProvisionInput({ memberId: "" })).toThrow();
    expect(() => validateProvisionInput({ memberId: "a/b" })).toThrow();
  });
});

describe("nextClaims", () => {
  it("adds Member to empty claims", () => {
    expect(nextClaims(undefined, "Member")).toEqual({ roles: ["Member"] });
  });
  it("merges Member without clobbering existing roles / scannerEventIds", () => {
    expect(nextClaims({ roles: ["ProjectManager"], scannerEventIds: ["e1"] }, "Member")).toEqual({
      roles: ["ProjectManager", "Member"],
      scannerEventIds: ["e1"],
    });
  });
  it("is idempotent when the role is already present", () => {
    expect(nextClaims({ roles: ["Member"] }, "Member")).toEqual({ roles: ["Member"] });
  });
});

interface FakeUser {
  uid: string;
  email?: string;
  customClaims?: Record<string, unknown>;
}

function fakeDeps(opts: { member?: Record<string, unknown> | null; usersByEmail?: Record<string, FakeUser> }) {
  const calls = { createUser: [] as string[], setClaims: [] as string[], linkUid: [] as string[] };
  const users = opts.usersByEmail ?? {};
  const deps: ProvisionDeps = {
    getMember: async () => opts.member ?? null,
    getUserByEmail: async (email) => users[email] ?? null,
    createUser: async (email) => {
      calls.createUser.push(email);
      const user = { uid: `new-${email}`, email };
      users[email] = user;
      return user;
    },
    setClaims: async (uid) => {
      calls.setClaims.push(uid);
    },
    linkUid: async (_memberId, uid) => {
      calls.linkUid.push(uid);
    },
    passwordResetLink: async (email) => `link:${email}`,
  };
  return { deps, calls };
}

describe("provisionMember", () => {
  const active = { email: "a@b.co", active: true };

  it("rejects when the member is already linked to a DIFFERENT auth user (email changed)", async () => {
    const { deps, calls } = fakeDeps({
      member: { ...active, uid: "old-uid" },
      usersByEmail: { "a@b.co": { uid: "other-uid" } },
    });
    await expect(provisionMember(deps, "m1")).rejects.toMatchObject({ code: "failed-precondition" });
    expect(calls.createUser).toEqual([]);
    expect(calls.setClaims).toEqual([]);
    expect(calls.linkUid).toEqual([]);
  });

  it("rejects when the member is linked but no auth user matches the email (would mint a new account)", async () => {
    const { deps, calls } = fakeDeps({ member: { ...active, uid: "old-uid" } });
    await expect(provisionMember(deps, "m1")).rejects.toMatchObject({ code: "failed-precondition" });
    expect(calls.createUser).toEqual([]);
    expect(calls.linkUid).toEqual([]);
  });

  it("re-provisions idempotently when the stored uid matches the resolved user (resend invite)", async () => {
    const { deps, calls } = fakeDeps({
      member: { ...active, uid: "u1" },
      usersByEmail: { "a@b.co": { uid: "u1", email: "a@b.co" } },
    });
    const result = await provisionMember(deps, "m1");
    expect(result).toEqual({ email: "a@b.co", actionLink: "link:a@b.co" });
    expect(calls.createUser).toEqual([]);
    expect(calls.setClaims).toEqual(["u1"]);
    expect(calls.linkUid).toEqual(["u1"]);
  });

  it("provisions an unlinked member, creating the auth user when absent", async () => {
    const { deps, calls } = fakeDeps({ member: active });
    const result = await provisionMember(deps, "m1");
    expect(result).toEqual({ email: "a@b.co", actionLink: "link:a@b.co" });
    expect(calls.createUser).toEqual(["a@b.co"]);
    expect(calls.setClaims).toEqual(["new-a@b.co"]);
    expect(calls.linkUid).toEqual(["new-a@b.co"]);
  });

  it("reuses an existing auth user for an unlinked member (pre-created account)", async () => {
    const { deps, calls } = fakeDeps({
      member: active,
      usersByEmail: { "a@b.co": { uid: "u9", email: "a@b.co", customClaims: { roles: ["Scanner"] } } },
    });
    await provisionMember(deps, "m1");
    expect(calls.createUser).toEqual([]);
    expect(calls.linkUid).toEqual(["u9"]);
  });

  it("rejects a missing / inactive / email-less member", async () => {
    await expect(provisionMember(fakeDeps({ member: null }).deps, "m1")).rejects.toMatchObject({
      code: "not-found",
    });
    await expect(
      provisionMember(fakeDeps({ member: { email: "a@b.co", active: false } }).deps, "m1"),
    ).rejects.toMatchObject({ code: "failed-precondition" });
    await expect(
      provisionMember(fakeDeps({ member: { active: true } }).deps, "m1"),
    ).rejects.toMatchObject({ code: "failed-precondition" });
  });
});
