import { describe, expect, it } from "vitest";
import { toSiteConfigDoc, toSiteConfigInput, EMPTY_LINKTREE } from "./site-config-mapper";
import type { SiteConfig, LinktreeLink } from "@luminova/types";

const linktree = {
  handle: "@jci.oriente",
  tagline: "Sé el cambio.",
  taglineAccent: "Become the Change.",
  links: [
    {
      id: "a1",
      icon: "user" as const,
      title: "Únete",
      description: "d",
      url: "https://wa.me/591",
      isPrimary: true,
      badge: "Únete",
      active: true,
    },
  ],
  socials: [
    { platform: "instagram" as const, url: "https://instagram.com/jci" },
    { platform: "facebook" as const, url: "https://facebook.com/jci" },
    { platform: "tiktok" as const, url: "https://tiktok.com/@jci" },
  ],
};

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
  linktree,
};

function docFrom(partial: Partial<SiteConfig>): SiteConfig {
  return {
    version: 4,
    stats: input.stats,
    timeline: input.timeline,
    mvv: input.mvv,
    reasons: input.reasons,
    contact: input.contact,
    ...partial,
  } as unknown as SiteConfig;
}

describe("site-config mapper", () => {
  it("bumps the version", () => {
    expect(toSiteConfigDoc(input, 3).version).toBe(4);
  });
  it("round-trips timeline through the form shape", () => {
    expect(toSiteConfigInput(docFrom({})).timeline).toEqual(input.timeline);
  });
  it("passes linktree through on save", () => {
    expect(toSiteConfigDoc(input, 3).linktree).toEqual(linktree);
  });
  it("round-trips linktree on load", () => {
    expect(toSiteConfigInput(docFrom({ linktree })).linktree).toEqual(linktree);
  });
  it("fills a default linktree when the stored doc lacks one", () => {
    expect(toSiteConfigInput(docFrom({})).linktree).toEqual(EMPTY_LINKTREE);
  });
  it("normalizes socials to the three platforms in order", () => {
    const result = toSiteConfigInput(docFrom({ linktree: { ...linktree, socials: [] } }));
    expect(result.linktree.socials.map((s) => s.platform)).toEqual([
      "instagram",
      "facebook",
      "tiktok",
    ]);
  });
  it("generates an id for a link missing one", () => {
    const noId = { ...linktree.links[0], id: "" } as LinktreeLink;
    const result = toSiteConfigInput(docFrom({ linktree: { ...linktree, links: [noId] } }));
    expect(result.linktree.links[0]!.id).not.toBe("");
  });
});
