import { describe, expect, it } from "vitest";
import { toSiteConfigDoc, toSiteConfigInput } from "./site-config-mapper";
import type { SiteConfig } from "@luminova/types";

const input = {
  stats: {
    programCount: 5,
    countries: "100+",
    membersWorldwide: "200.000+",
    nationalAwards: 11,
    efficiencyPct: 100,
    standoutOrg: { year: "2021", title: "OLM" },
  },
  timeline: [{ year: "1993", title: "Fundación", description: "d" }],
  mvv: { mision: "m", vision: "v", valores: "x" },
  reasons: [{ number: "01", title: "Red", body: "b" }],
  contact: {
    email: "a@b.com",
    location: "SC",
    meetingSchedule: "Mié",
    links: [{ label: "JCI", url: "https://jci.cc" }],
  },
};

describe("site-config mapper", () => {
  it("bumps the version", () => {
    expect(toSiteConfigDoc(input, 3).version).toBe(4);
  });
  it("round-trips timeline through the form shape", () => {
    const doc = {
      version: 4,
      stats: input.stats,
      timeline: input.timeline,
      mvv: input.mvv,
      reasons: input.reasons,
      contact: input.contact,
    } as unknown as SiteConfig;
    expect(toSiteConfigInput(doc).timeline).toEqual(input.timeline);
  });
});
