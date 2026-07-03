import { describe, it, expect } from "vitest";
import { photoDocSchema, initiativeDocSchema } from "./initiative-doc-schema";

const ts = { toMillis: () => 0, toDate: () => new Date(0) };

const validPhoto = {
  id: "photo-1",
  url: "https://example.com/p.jpg",
  caption: "Equipo en jornada",
  uploadedAt: ts,
  uploadedBy: "member-1",
};

const requiredDoc = {
  termId: "2026",
  title: "Jornada en La Cuchilla",
  description: "Descripción de la iniciativa.",
  category: "DesarrolloComunitario",
  startDate: ts,
  endDate: ts,
  roster: {
    directorId: "member-1",
    coDirectorIds: ["member-2"],
    teamIds: ["member-3"],
  },
  status: "Finalizado",
};

const validDoc = {
  ...requiredDoc,
  photos: [validPhoto],
  impact: {
    personsImpacted: 40,
    volunteers: 6,
    custom: [{ label: "Kits entregados", value: "40" }],
    closingSummary: "Cierre exitoso.",
  },
  finalReport: { filedAt: ts, filedBy: "member-1" },
  directionUids: ["member-1", "member-2"],
  featured: true,
};

describe("photoDocSchema", () => {
  it("parses a valid photo doc", () => {
    const parsed = photoDocSchema.parse(validPhoto);
    expect(parsed.id).toBe("photo-1");
  });
});

describe("initiativeDocSchema", () => {
  it("parses a fully-valid doc and round-trips its fields", () => {
    const parsed = initiativeDocSchema.parse(validDoc);
    expect(parsed).toEqual(validDoc);
  });

  it("rejects a malformed doc (ISO string instead of Timestamp)", () => {
    const malformed = { ...validDoc, startDate: "2026-01-01T00:00:00.000Z" };
    expect(initiativeDocSchema.safeParse(malformed).success).toBe(false);
  });

  it("defaults photos to [], impact/finalReport to null when absent", () => {
    const parsed = initiativeDocSchema.parse(requiredDoc);
    expect(parsed.photos).toEqual([]);
    expect(parsed.impact).toBeNull();
    expect(parsed.finalReport).toBeNull();
  });

  it("defaults directionUids to [] and featured to false when absent", () => {
    const parsed = initiativeDocSchema.parse(requiredDoc);
    expect(parsed.directionUids).toEqual([]);
    expect(parsed.featured).toBe(false);
  });

  it("strips unknown extra fields", () => {
    const parsed = initiativeDocSchema.parse({ ...validDoc, legacyField: "gone" });
    expect(parsed).not.toHaveProperty("legacyField");
  });
});
