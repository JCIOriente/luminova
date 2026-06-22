import { describe, expect, it } from "vitest";
import { siteConfigSchema } from "./site-config-schema";

const valid = {
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
    links: [{ label: "JCI", url: "https://jci.cc" }],
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
});
