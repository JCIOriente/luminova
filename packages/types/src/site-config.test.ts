import { describe, expect, it } from "vitest";
import { siteConfigSchema } from "./site-config-schema";

const valid = {
  hero: { motto: "Se ve, se siente, el espíritu de Oriente", submotto: "" },
  stats: {
    programCount: 5,
    countries: "100+",
    membersWorldwide: "200.000+",
    nationalAwards: 11,
    efficiencyPct: 100,
    standoutOrg: { year: "2021", title: "Organización Local Más Sobresaliente" },
  },
  timeline: [{ year: "1993", title: "Se funda JCI Oriente", description: "..." }],
  mvv: { mision: "m", vision: "v", valores: "x" },
  reasons: [{ number: "01", title: "Red", body: "..." }],
  contact: {
    email: "jci@example.com",
    location: "Santa Cruz",
    meetingSchedule: "Miércoles 19:30",
    mapUrl: "https://maps.app.goo.gl/abc",
    whatsapp: "https://wa.me/59170000000",
    broadcastChannel: "",
    socials: {
      instagram: "https://instagram.com/jci.oriente",
      facebook: "https://facebook.com/jci",
      tiktok: "",
      linkedin: "",
    },
    links: [{ label: "JCI", url: "https://jci.cc" }],
  },
  linktree: {
    handle: "@jci.oriente",
    tagline: "Sé el cambio.",
    taglineAccent: "Become the Change.",
    links: [
      {
        id: "a1",
        icon: "user",
        title: "Quiero ser miembro",
        description: "Postula y únete",
        url: "https://wa.me/591",
        isPrimary: true,
        badge: "Únete",
        active: true,
      },
    ],
    socials: [{ platform: "instagram", url: "https://instagram.com/jci.oriente" }],
  },
};

describe("siteConfigSchema", () => {
  it("accepts a valid config", () => {
    expect(siteConfigSchema.safeParse(valid).success).toBe(true);
  });
  it("rejects a bad email", () => {
    const r = siteConfigSchema.safeParse({
      ...valid,
      contact: { ...valid.contact, email: "nope" },
    });
    expect(r.success).toBe(false);
  });
  it("rejects efficiency over 100", () => {
    const r = siteConfigSchema.safeParse({
      ...valid,
      stats: { ...valid.stats, efficiencyPct: 101 },
    });
    expect(r.success).toBe(false);
  });
  it("rejects a javascript: link url (XSS guard)", () => {
    const r = siteConfigSchema.safeParse({
      ...valid,
      contact: { ...valid.contact, links: [{ label: "x", url: "javascript:alert(1)" }] },
    });
    expect(r.success).toBe(false);
  });
  it("accepts a '#' placeholder link url", () => {
    const r = siteConfigSchema.safeParse({
      ...valid,
      contact: { ...valid.contact, links: [{ label: "x", url: "#" }] },
    });
    expect(r.success).toBe(true);
  });
  it("accepts a mailto: linktree url", () => {
    const r = siteConfigSchema.safeParse({
      ...valid,
      linktree: {
        ...valid.linktree,
        links: [{ ...valid.linktree.links[0], url: "mailto:jci@example.com" }],
      },
    });
    expect(r.success).toBe(true);
  });
  it("rejects a javascript: linktree url", () => {
    const r = siteConfigSchema.safeParse({
      ...valid,
      linktree: {
        ...valid.linktree,
        links: [{ ...valid.linktree.links[0], url: "javascript:alert(1)" }],
      },
    });
    expect(r.success).toBe(false);
  });
  it("rejects an icon outside the allowed set", () => {
    const r = siteConfigSchema.safeParse({
      ...valid,
      linktree: {
        ...valid.linktree,
        links: [{ ...valid.linktree.links[0], icon: "rocket" }],
      },
    });
    expect(r.success).toBe(false);
  });
  it("requires the linktree section", () => {
    const noLinktree = { ...valid };
    delete (noLinktree as { linktree?: unknown }).linktree;
    expect(siteConfigSchema.safeParse(noLinktree).success).toBe(false);
  });
  it("accepts an empty social url", () => {
    const r = siteConfigSchema.safeParse({
      ...valid,
      linktree: {
        ...valid.linktree,
        socials: [{ platform: "instagram", url: "" }],
      },
    });
    expect(r.success).toBe(true);
  });
  it("still rejects a javascript: social url", () => {
    const r = siteConfigSchema.safeParse({
      ...valid,
      linktree: {
        ...valid.linktree,
        socials: [{ platform: "instagram", url: "javascript:alert(1)" }],
      },
    });
    expect(r.success).toBe(false);
  });
});
