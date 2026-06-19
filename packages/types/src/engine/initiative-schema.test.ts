import { describe, expect, it } from "vitest";
import {
  initiativeFormSchema,
  initiativeImpactSchema,
  initiativeRosterSchema,
} from "./initiative-schema";

const base = {
  title: "Proyecto Aurora",
  description: "Descripción de prueba con al menos diez caracteres.",
  category: "DesarrolloComunitario" as const,
  startDate: "2026-01-01",
  endDate: "2026-06-30",
  roster: { directorId: "m1", coDirectorIds: [] as string[], teamIds: [] as string[] },
  status: "Planificacion" as const,
  featured: false,
};

describe("initiativeFormSchema", () => {
  it("accepts a minimal valid initiative", () => {
    expect(initiativeFormSchema.safeParse(base).success).toBe(true);
  });
  it("rejects a title under 3 chars", () => {
    expect(initiativeFormSchema.safeParse({ ...base, title: "ab" }).success).toBe(false);
  });
  it("requires a director", () => {
    const r = initiativeFormSchema.safeParse({
      ...base,
      roster: { ...base.roster, directorId: "" },
    });
    expect(r.success).toBe(false);
  });
  it("rejects co-director equal to director", () => {
    const r = initiativeFormSchema.safeParse({
      ...base,
      roster: { directorId: "m1", coDirectorIds: ["m1"], teamIds: [] },
    });
    expect(r.success).toBe(false);
  });
  it("rejects director present in the team", () => {
    const r = initiativeFormSchema.safeParse({
      ...base,
      roster: { directorId: "m1", coDirectorIds: [], teamIds: ["m1"] },
    });
    expect(r.success).toBe(false);
  });
  it("rejects co-director present in the team", () => {
    const r = initiativeFormSchema.safeParse({
      ...base,
      roster: { directorId: "m1", coDirectorIds: ["m2"], teamIds: ["m2"] },
    });
    expect(r.success).toBe(false);
  });
  it("requires teamIds (no implicit default)", () => {
    const r = initiativeFormSchema.safeParse({
      title: "Proyecto Aurora",
      roster: { directorId: "m1", coDirectorIds: [] },
      status: "Planificacion",
    });
    expect(r.success).toBe(false);
  });
  it("requires featured (no implicit default)", () => {
    const r = initiativeFormSchema.safeParse({
      title: base.title,
      description: base.description,
      category: base.category,
      startDate: base.startDate,
      endDate: base.endDate,
      roster: base.roster,
      status: base.status,
    });
    expect(r.success).toBe(false);
  });
});

describe("initiativeRosterSchema", () => {
  it("rejects the director among the co-directors", () => {
    const r = initiativeRosterSchema.safeParse({
      directorId: "m1",
      coDirectorIds: ["m1"],
      teamIds: [],
    });
    expect(r.success).toBe(false);
  });

  it("rejects duplicate co-directors", () => {
    const r = initiativeRosterSchema.safeParse({
      directorId: "m1",
      coDirectorIds: ["m2", "m2"],
      teamIds: [],
    });
    expect(r.success).toBe(false);
  });

  it("rejects a co-director who is also on the team", () => {
    const r = initiativeRosterSchema.safeParse({
      directorId: "m1",
      coDirectorIds: ["m2"],
      teamIds: ["m2"],
    });
    expect(r.success).toBe(false);
  });

  it("accepts multiple distinct co-directors", () => {
    const r = initiativeRosterSchema.safeParse({
      directorId: "m1",
      coDirectorIds: ["m2", "m3"],
      teamIds: ["m4"],
    });
    expect(r.success).toBe(true);
  });
});

const VALID_FORM = {
  title: "Reciclá Santa Cruz",
  description: "Puntos de reciclaje y educación ambiental en cinco barrios.",
  category: "DesarrolloComunitario",
  startDate: "2026-02-01",
  endDate: "2026-08-31",
  roster: { directorId: "m1", coDirectorIds: [], teamIds: [] },
  status: "EnEjecucion",
  featured: true,
};

describe("initiativeFormSchema (C1-lite fields)", () => {
  it("accepts a complete form", () => {
    expect(initiativeFormSchema.safeParse(VALID_FORM).success).toBe(true);
  });
  it("rejects an unknown category", () => {
    expect(
      initiativeFormSchema.safeParse({ ...VALID_FORM, category: "MedioAmbiente" }).success,
    ).toBe(false);
  });
  it("rejects endDate before startDate", () => {
    expect(
      initiativeFormSchema.safeParse({
        ...VALID_FORM,
        startDate: "2026-09-01",
        endDate: "2026-02-01",
      }).success,
    ).toBe(false);
  });
  it("rejects a short description", () => {
    expect(initiativeFormSchema.safeParse({ ...VALID_FORM, description: "corto" }).success).toBe(
      false,
    );
  });
});

describe("initiativeImpactSchema", () => {
  const VALID_IMPACT = {
    personsImpacted: 600,
    volunteers: 45,
    custom: [{ label: "Juguetes entregados", value: "1.200" }],
    closingSummary: "Tres jornadas de entrega; superamos la meta de 500 niños.",
  };
  it("accepts a complete impact", () => {
    expect(initiativeImpactSchema.safeParse(VALID_IMPACT).success).toBe(true);
  });
  it("rejects negative numbers", () => {
    expect(initiativeImpactSchema.safeParse({ ...VALID_IMPACT, personsImpacted: -1 }).success).toBe(
      false,
    );
  });
  it("rejects an empty custom metric label", () => {
    expect(
      initiativeImpactSchema.safeParse({
        ...VALID_IMPACT,
        custom: [{ label: "", value: "3" }],
      }).success,
    ).toBe(false);
  });
});
