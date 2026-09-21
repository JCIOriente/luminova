import { describe, expect, it } from "vitest";
import { inviteLink } from "./invite-link";

describe("inviteLink", () => {
  it("puts the token in the FRAGMENT", () => {
    // Firebase Hosting access logs record path and query, never the fragment; nor does a
    // Referer header, nor document.referrer. A query param would put a live bearer credential
    // into a log sink with a long retention that nobody on this team controls.
    expect(inviteLink("abc", "https://x.test")).toBe("https://x.test/invitacion#abc");
  });

  it("does not double a trailing slash on the origin", () => {
    expect(inviteLink("abc", "https://x.test/")).toBe("https://x.test/invitacion#abc");
  });

  it("keeps the whole link short enough for one WhatsApp line", () => {
    const link = inviteLink("t".repeat(43), "https://jcioriente-backstage.web.app");
    expect(link.length).toBeLessThan(100);
  });

  it("percent-encodes nothing — base64url and /invitacion are both URL-safe", () => {
    const token = "aB3-_xyz";
    expect(inviteLink(token, "https://x.test")).toContain(`#${token}`);
  });
});
