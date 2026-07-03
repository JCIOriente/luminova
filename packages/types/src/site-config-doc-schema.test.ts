import { describe, it, expect } from "vitest";
import { siteConfigDocSchema } from "./site-config-doc-schema";
import { fakeTimestamp, without } from "./doc-schema-test-helpers.js";

const validDoc = {
  version: 3,
  updatedAt: fakeTimestamp,
  hero: { motto: "Juventud que transforma", submotto: "Bolivia Oriente" },
  stats: {
    programCount: 4,
    countries: "124",
    membersWorldwide: "200,000+",
    nationalAwards: 12,
    efficiencyPct: 87,
    standoutOrg: { year: "2025", title: "Mejor filial" },
  },
  timeline: [{ year: "2020", title: "Fundación", description: "Inicios de la filial." }],
  mvv: { mision: "Misión.", vision: "Visión.", valores: "Valores." },
  reasons: [{ number: "1", title: "Networking", body: "Conecta con líderes." }],
  contact: {
    email: "contacto@jcioriente.org",
    location: "Santa Cruz de la Sierra",
    meetingSchedule: "Martes 19:00",
    mapUrl: "https://maps.example.com/x",
    socials: {
      instagram: "https://instagram.com/jcioriente",
      facebook: "https://facebook.com/jcioriente",
      tiktok: "https://tiktok.com/@jcioriente",
      linkedin: "https://linkedin.com/company/jcioriente",
    },
    links: [{ label: "WhatsApp", url: "https://wa.me/123" }],
  },
  linktree: {
    handle: "@jcioriente",
    tagline: "Conecta con nosotros",
    taglineAccent: "hoy",
    links: [
      {
        id: "link-1",
        icon: "globe",
        title: "Sitio web",
        description: "Nuestro portal",
        url: "https://jcioriente.org",
        isPrimary: true,
        badge: "Nuevo",
        active: true,
      },
    ],
    socials: [{ platform: "instagram", url: "https://instagram.com/jcioriente" }],
  },
};

describe("siteConfigDocSchema", () => {
  it("parses a fully-valid doc and round-trips its fields", () => {
    const parsed = siteConfigDocSchema.parse(validDoc);
    expect(parsed).toEqual(validDoc);
  });

  it("rejects a malformed doc (updatedAt as ISO string instead of Timestamp)", () => {
    const malformed = { ...validDoc, updatedAt: "2024-01-01" };
    expect(siteConfigDocSchema.safeParse(malformed).success).toBe(false);
  });

  it("defaults hero when absent (legacy pre-hero docs)", () => {
    const parsed = siteConfigDocSchema.parse(without(validDoc, "hero"));
    expect(parsed.hero).toEqual({ motto: "", submotto: "" });
  });

  it("leaves linktree undefined when absent", () => {
    const parsed = siteConfigDocSchema.parse(without(validDoc, "linktree"));
    expect(parsed.linktree).toBeUndefined();
  });

  it("rejects an unknown linktree icon", () => {
    const malformed = {
      ...validDoc,
      linktree: {
        ...validDoc.linktree,
        links: [{ ...validDoc.linktree.links[0], icon: "not-an-icon" }],
      },
    };
    expect(siteConfigDocSchema.safeParse(malformed).success).toBe(false);
  });

  it("rejects an unknown linktree social platform", () => {
    const malformed = {
      ...validDoc,
      linktree: {
        ...validDoc.linktree,
        socials: [{ platform: "not-a-platform", url: "https://x.com" }],
      },
    };
    expect(siteConfigDocSchema.safeParse(malformed).success).toBe(false);
  });

  it("strips unknown extra fields", () => {
    const parsed = siteConfigDocSchema.parse({ ...validDoc, legacyField: "gone" });
    expect(parsed).not.toHaveProperty("legacyField");
  });

  it("rejects a missing required field (contact)", () => {
    expect(siteConfigDocSchema.safeParse(without(validDoc, "contact")).success).toBe(false);
  });
});
