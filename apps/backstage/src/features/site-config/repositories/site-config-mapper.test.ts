import { describe, expect, it } from "vitest";
import { toSiteConfigDoc, toSiteConfigInput, EMPTY_LINKTREE } from "./site-config-mapper";
import { LINKTREE_SOCIAL_PLATFORMS, type SiteConfig, type LinktreeLink } from "@luminova/types";

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
    { platform: "linkedin" as const, url: "https://linkedin.com/company/jci" },
    { platform: "whatsapp" as const, url: "https://whatsapp.com/channel/jci" },
    { platform: "youtube" as const, url: "https://youtube.com/@jci" },
  ],
};

const input = {
  hero: { motto: "Se ve, se siente, el espíritu de Oriente", submotto: "" },
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
    mapUrl: "https://maps.app.goo.gl/abc",
    whatsapp: "https://wa.me/59170000000",
    broadcastChannel: "https://whatsapp.com/channel/abc",
    socials: { instagram: "https://instagram.com/jci", facebook: "", tiktok: "", linkedin: "" },
    links: [{ label: "JCI", url: "https://jci.cc" }],
  },
  linktree,
};

function docFrom(partial: Partial<SiteConfig>): SiteConfig {
  return {
    version: 4,
    hero: input.hero,
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
  it("normalizes socials to the canonical platforms in order", () => {
    const result = toSiteConfigInput(docFrom({ linktree: { ...linktree, socials: [] } }));
    expect(result.linktree.socials.map((s) => s.platform)).toEqual([...LINKTREE_SOCIAL_PLATFORMS]);
  });
  it("generates an id for a link missing one", () => {
    const noId = { ...linktree.links[0], id: "" } as LinktreeLink;
    const result = toSiteConfigInput(docFrom({ linktree: { ...linktree, links: [noId] } }));
    expect(result.linktree.links[0]!.id).not.toBe("");
  });
});
