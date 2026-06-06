import { describe, it, expect } from "vitest";
import { memberSchema } from "./member-schema";
import { MEMBER_STATUSES } from "./member";

const valid = {
  name: "Ana Pérez",
  email: "ana@jci.bo",
  phone: "777",
  role: "Presidenta",
  profession: "Ingeniera",
  joinDate: "2020-03-15",
  birthdate: "1992-07-01",
  status: "Activo" as const,
};

describe("memberSchema", () => {
  it("accepts a valid member", () => {
    expect(memberSchema.safeParse(valid).success).toBe(true);
  });

  it("accepts omitted optional phone and profession", () => {
    const rest = {
      name: valid.name,
      email: valid.email,
      role: valid.role,
      joinDate: valid.joinDate,
      birthdate: valid.birthdate,
      status: valid.status,
    };
    expect(memberSchema.safeParse(rest).success).toBe(true);
  });

  it("rejects a short name", () => {
    expect(memberSchema.safeParse({ ...valid, name: "Al" }).success).toBe(false);
  });

  it("rejects an invalid email", () => {
    expect(memberSchema.safeParse({ ...valid, email: "nope" }).success).toBe(false);
  });

  it("rejects an unparseable date", () => {
    expect(memberSchema.safeParse({ ...valid, joinDate: "not-a-date" }).success).toBe(false);
  });

  it("rejects an overflow date that silently rolls over", () => {
    expect(memberSchema.safeParse({ ...valid, joinDate: "2024-02-30" }).success).toBe(false);
  });

  it("rejects a status outside the enum", () => {
    expect(memberSchema.safeParse({ ...valid, status: "Suspendido" }).success).toBe(false);
  });

  it("exposes the three Spanish status values", () => {
    expect(MEMBER_STATUSES).toEqual(["Activo", "Inactivo", "Desafiliado"]);
  });
});
