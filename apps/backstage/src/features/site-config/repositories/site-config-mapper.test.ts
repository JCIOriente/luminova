import { describe, expect, it } from "vitest";
import { toSiteConfigDoc, toSiteConfigInput } from "./site-config-mapper";
import type { SiteConfig } from "@luminova/types";

const input = {
  stats: { programCount: 5, countries: "100+", membersWorldwide: "200.000+", nationalAwards: 11, efficiencyPct: 100, standoutOrg: { year: "2021", title: "OLM" } },
  allies: [{ nombre: "Unifranz" }],
  timeline: [{ year: "1993", title: "Fundación", description: "d" }],
  mvv: { mision: "m", vision: "v", valores: "x" },
  reasons: [{ number: "01", title: "Red", body: "b" }],
  contact: { email: "a@b.com", location: "SC", meetingSchedule: "Mié", links: [{ label: "JCI", url: "https://jci.cc" }] },
};

describe("site-config mapper", () => {
  it("flattens allies to strings for the doc", () => {
    expect(toSiteConfigDoc(input, 3).allies).toEqual(["Unifranz"]);
  });
  it("bumps the version", () => {
    expect(toSiteConfigDoc(input, 3).version).toBe(4);
  });
  it("round-trips allies back to row objects", () => {
    const doc = { version: 4, allies: ["Unifranz"], stats: input.stats, timeline: input.timeline, mvv: input.mvv, reasons: input.reasons, contact: input.contact } as unknown as SiteConfig;
    expect(toSiteConfigInput(doc).allies).toEqual([{ nombre: "Unifranz" }]);
  });
});
