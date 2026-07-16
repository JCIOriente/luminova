import { describe, expect, it } from "vitest";
import { buildInviteEmail } from "./invite-email.js";

describe("buildInviteEmail", () => {
  it("addresses the recipient and carries the action link in html + text", () => {
    const mail = buildInviteEmail("ada@example.com", {
      name: "Ada Lovelace",
      actionLink: "https://reset.example/abc",
    });
    expect(mail.to).toEqual(["ada@example.com"]);
    expect(mail.message.subject).toMatch(/JCI Oriente/);
    expect(mail.message.text).toContain("Hola Ada,");
    expect(mail.message.text).toContain("https://reset.example/abc");
    expect(mail.message.html).toContain("https://reset.example/abc");
    expect(mail.message.html).toContain("Ada");
  });

  it("escapes html-significant characters in the name and link", () => {
    const mail = buildInviteEmail("x@y.co", {
      name: "<b>Eve</b>",
      actionLink: 'https://e/?a=1&b="2"',
    });
    expect(mail.message.html).not.toContain("<b>Eve</b>");
    expect(mail.message.html).toContain("&amp;b=");
    expect(mail.message.html).not.toContain('a=1&b="2"');
  });

  it("falls back to a greeting when the name is blank", () => {
    const mail = buildInviteEmail("x@y.co", { name: "   ", actionLink: "https://e" });
    expect(mail.message.text).toContain("Hola Hola,");
  });
});
