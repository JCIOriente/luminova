import { describe, expect, it } from "vitest";
import {
  audienceSchema,
  notificationCreateSchema,
  INBOX_MUTABLE_FIELDS,
  NOTIFICATION_BODY_MAX_LENGTH,
  NOTIFICATION_TITLE_MAX_LENGTH,
  NOTIFICATION_URL_MAX_LENGTH,
} from "./notification.js";

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

describe("notificationCreateSchema messages are Spanish", () => {
  const payload = {
    title: "Hola",
    body: "Cuerpo",
    url: null,
    audience: { type: "everyone" as const },
  };
  const messageFor = (input: Record<string, unknown>) => {
    const r = notificationCreateSchema.safeParse({ ...payload, ...input });
    return r.success ? null : r.error.issues[0]?.message;
  };
  it("requires a title", () => {
    expect(messageFor({ title: "" })).toBe("Requerido.");
  });
  it("requires a body", () => {
    expect(messageFor({ body: "" })).toBe("Requerido.");
  });
  it("caps the title", () => {
    expect(messageFor({ title: "x".repeat(NOTIFICATION_TITLE_MAX_LENGTH + 1) })).toBe(
      `Máximo ${NOTIFICATION_TITLE_MAX_LENGTH} caracteres.`,
    );
  });
  it("caps the body", () => {
    expect(messageFor({ body: "x".repeat(NOTIFICATION_BODY_MAX_LENGTH + 1) })).toBe(
      `Máximo ${NOTIFICATION_BODY_MAX_LENGTH} caracteres.`,
    );
  });
  it("caps the url", () => {
    const url = `https://jci.bo/${"x".repeat(NOTIFICATION_URL_MAX_LENGTH)}`;
    expect(messageFor({ url })).toBe(`Máximo ${NOTIFICATION_URL_MAX_LENGTH} caracteres.`);
  });
  it("rejects a malformed url", () => {
    expect(messageFor({ url: "no es un enlace" })).toBe("Ingresa un enlace válido.");
  });
});
