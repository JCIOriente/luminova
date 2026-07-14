import { describe, it, expect } from "vitest";
import { memberSchema } from "./member-schema";
import { MEMBER_STATUSES } from "./member";

const valid = {
  name: "Ana Pérez",
  email: "ana@jci.bo",
  phone: "70012345",
  gender: "Femenino" as const,
  profession: "Ingeniera",
  joinDate: "2020-03-15",
  birthdate: "1992-07-01",
  status: "Activo" as const,
  cargoId: null,
  comisionIds: [],
};

describe("memberSchema", () => {
  it("accepts a valid member", () => {
    expect(memberSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects a phone that is not 8 digits", () => {
    expect(memberSchema.safeParse({ ...valid, phone: "777" }).success).toBe(false);
  });

  it("accepts a blank phone (optional)", () => {
    expect(memberSchema.safeParse({ ...valid, phone: "" }).success).toBe(true);
  });

  it("accepts omitted optional phone and profession", () => {
    const rest = {
      name: valid.name,
      email: valid.email,
      gender: valid.gender,
      joinDate: valid.joinDate,
      birthdate: valid.birthdate,
      status: valid.status,
      cargoId: valid.cargoId,
      comisionIds: valid.comisionIds,
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

  it("rejects a missing gender", () => {
    const rest: Partial<typeof valid> = { ...valid };
    delete rest.gender;
    expect(memberSchema.safeParse(rest).success).toBe(false);
  });

  it("exposes the three Spanish status values", () => {
    // Persisted-contract pin: these Spanish values are stored verbatim in member docs, so
    // a rename silently breaks every existing document. This literal is the intentional
    // tripwire — if it goes red, that IS the point (migrate the data, don't retype it).
    expect(MEMBER_STATUSES).toEqual(["Activo", "Inactivo", "Desafiliado"]);
  });
});

describe("memberSchema isPastPresident", () => {
  it("accepts an explicit boolean", () => {
    const parsed = memberSchema.parse({ ...valid, isPastPresident: true });
    expect(parsed.isPastPresident).toBe(true);
  });

  it("is optional (omitted parses fine)", () => {
    const parsed = memberSchema.parse(valid);
    expect(parsed.isPastPresident).toBeUndefined();
  });
});
