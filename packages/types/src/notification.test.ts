import { describe, expect, it } from "vitest";
import { audienceSchema, notificationCreateSchema, INBOX_MUTABLE_FIELDS } from "./notification.js";

describe("audienceSchema", () => {
  it("accepts everyone and members without roleId", () => {
    expect(audienceSchema.parse({ type: "everyone" })).toEqual({ type: "everyone" });
    expect(audienceSchema.parse({ type: "members" })).toEqual({ type: "members" });
  });
  it("requires roleId for role audience", () => {
    expect(() => audienceSchema.parse({ type: "role" })).toThrow();
    expect(audienceSchema.parse({ type: "role", roleId: "ExecutiveCommittee" })).toEqual({
      type: "role",
      roleId: "ExecutiveCommittee",
    });
  });
});

describe("notificationCreateSchema", () => {
  it("rejects an empty title", () => {
    expect(() =>
      notificationCreateSchema.parse({
        title: "",
        body: "x",
        url: null,
        audience: { type: "everyone" },
      }),
    ).toThrow();
  });
  it("accepts a well-formed compose payload", () => {
    const v = notificationCreateSchema.parse({
      title: "Reunión",
      body: "Sábado 10am",
      url: null,
      audience: { type: "members" },
    });
    expect(v.title).toBe("Reunión");
  });
});

describe("INBOX_MUTABLE_FIELDS", () => {
  it("locks everything except read", () => {
    expect(INBOX_MUTABLE_FIELDS).toEqual(["read"]);
  });
});
