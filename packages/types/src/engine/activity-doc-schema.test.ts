import { describe, it, expect } from "vitest";
import { activityDocSchema } from "./activity-doc-schema";

const ts = { toMillis: () => 0, toDate: () => new Date(0) };

const validPhoto = {
  id: "photo-1",
  url: "https://example.com/p.jpg",
  caption: null,
  uploadedAt: ts,
  uploadedBy: "member-1",
};

const requiredDoc = {
  termId: "2026",
  title: "Asamblea de julio",
  description: "Descripción de la actividad.",
  category: "Assembly",
  parentType: null,
  parentId: null,
  organizers: { directorId: "member-1", coDirectorIds: ["member-2"] },
  startAt: ts,
  endAt: ts,
  status: "Programada",
};

const validDoc = {
  ...requiredDoc,
  location: "Salón principal",
  photos: [validPhoto],
  hasCheckIns: true,
};

describe("activityDocSchema", () => {
  it("parses a fully-valid doc and round-trips its fields", () => {
    const parsed = activityDocSchema.parse(validDoc);
    expect(parsed).toEqual(validDoc);
  });

  it("rejects a malformed doc (ISO string instead of Timestamp)", () => {
    const malformed = { ...validDoc, startAt: "2026-01-01T00:00:00.000Z" };
    expect(activityDocSchema.safeParse(malformed).success).toBe(false);
  });

  it("defaults location to null and photos to [] when absent", () => {
    const parsed = activityDocSchema.parse(requiredDoc);
    expect(parsed.location).toBeNull();
    expect(parsed.photos).toEqual([]);
  });

  it("leaves hasCheckIns undefined when absent (pre-feature docs)", () => {
    const parsed = activityDocSchema.parse(requiredDoc);
    expect(parsed.hasCheckIns).toBeUndefined();
  });

  it("strips unknown extra fields", () => {
    const parsed = activityDocSchema.parse({ ...validDoc, legacyField: "gone" });
    expect(parsed).not.toHaveProperty("legacyField");
  });
});
