import { describe, it, expect } from "vitest";
import { qrPrefix } from "virtual:luminova-brand";
import { encodeMemberQr, decodeMemberQr } from "./member-qr";

const MEMBER = `${qrPrefix}:member:`;

describe("member-qr", () => {
  it("round-trips a member id", () => {
    expect(decodeMemberQr(encodeMemberQr("abc123"))).toBe("abc123");
  });

  it("prefixes with the profile's QR namespace", () => {
    expect(encodeMemberQr("abc123")).toBe(`${MEMBER}abc123`);
  });

  it("rejects a foreign QR", () => {
    expect(decodeMemberQr("https://example.com")).toBeNull();
    expect(decodeMemberQr(`${qrPrefix}:ally:abc`)).toBeNull();
    expect(decodeMemberQr("other-chapter:member:abc")).toBeNull();
  });

  it("rejects a missing or empty id", () => {
    expect(decodeMemberQr(MEMBER)).toBeNull();
    expect(decodeMemberQr("")).toBeNull();
  });

  it("rejects an id with separators (defends the composite doc id)", () => {
    expect(decodeMemberQr(`${MEMBER}a/b`)).toBeNull();
    expect(decodeMemberQr(`${MEMBER}a__b`)).toBeNull();
  });
});
