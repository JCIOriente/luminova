import { describe, it, expect } from "vitest";
import { notificationDocSchema, inboxDocSchema } from "./notification-doc-schema";
import { fakeTimestamp } from "./doc-schema-test-helpers.js";

const validDoc = {
  title: "Reunión mensual",
  body: "Nos vemos el jueves a las 19:00.",
  url: "https://jcioriente.org/eventos",
  audience: { type: "everyone" },
  createdBy: "uid-abc",
  createdAt: fakeTimestamp,
  stats: { pushSent: 42, pushFailed: 3 },
};

describe("notificationDocSchema", () => {
  it("parses a fully-valid doc and round-trips its fields", () => {
    const parsed = notificationDocSchema.parse(validDoc);
    expect(parsed).toEqual(validDoc);
  });

  it("accepts a null url and null stats (pre-fan-out state)", () => {
    const parsed = notificationDocSchema.parse({ ...validDoc, url: null, stats: null });
    expect(parsed.url).toBeNull();
    expect(parsed.stats).toBeNull();
  });

  it("accepts a members audience", () => {
    expect(
      notificationDocSchema.safeParse({ ...validDoc, audience: { type: "members" } }).success,
    ).toBe(true);
  });

  it("accepts a role audience carrying a roleId", () => {
    const parsed = notificationDocSchema.parse({
      ...validDoc,
      audience: { type: "role", roleId: "role-123" },
    });
    expect(parsed.audience).toEqual({ type: "role", roleId: "role-123" });
  });

  it("rejects a role audience with an empty roleId", () => {
    const malformed = { ...validDoc, audience: { type: "role", roleId: "" } };
    expect(notificationDocSchema.safeParse(malformed).success).toBe(false);
  });

  it("rejects an unknown audience type", () => {
    const malformed = { ...validDoc, audience: { type: "nobody" } };
    expect(notificationDocSchema.safeParse(malformed).success).toBe(false);
  });

  it("rejects createdAt as an ISO string instead of a Timestamp", () => {
    const malformed = { ...validDoc, createdAt: "2024-01-01" };
    expect(notificationDocSchema.safeParse(malformed).success).toBe(false);
  });

  it("rejects a stats object missing pushFailed", () => {
    const malformed = { ...validDoc, stats: { pushSent: 1 } };
    expect(notificationDocSchema.safeParse(malformed).success).toBe(false);
  });

  it("strips unknown extra fields", () => {
    const parsed = notificationDocSchema.parse({ ...validDoc, legacyField: "gone" });
    expect(parsed).not.toHaveProperty("legacyField");
  });
});

const validInboxDoc = {
  title: "Reunión mensual",
  body: "Nos vemos el jueves a las 19:00.",
  url: "https://jcioriente.org/eventos",
  read: false,
  createdAt: fakeTimestamp,
};

describe("inboxDocSchema", () => {
  it("parses a fully-valid inbox doc and round-trips its fields", () => {
    const parsed = inboxDocSchema.parse(validInboxDoc);
    expect(parsed).toEqual(validInboxDoc);
  });

  it("accepts a null url and a read=true copy", () => {
    const parsed = inboxDocSchema.parse({ ...validInboxDoc, url: null, read: true });
    expect(parsed.url).toBeNull();
    expect(parsed.read).toBe(true);
  });

  it("rejects a missing read flag", () => {
    const withoutRead: Record<string, unknown> = { ...validInboxDoc };
    delete withoutRead.read;
    expect(inboxDocSchema.safeParse(withoutRead).success).toBe(false);
  });

  it("rejects createdAt as an ISO string instead of a Timestamp", () => {
    expect(inboxDocSchema.safeParse({ ...validInboxDoc, createdAt: "2024-01-01" }).success).toBe(
      false,
    );
  });
});
