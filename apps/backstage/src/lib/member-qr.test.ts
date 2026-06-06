import { describe, it, expect } from "vitest";
import { encodeMemberQr, decodeMemberQr } from "./member-qr";

describe("member-qr", () => {
  it("round-trips a member id", () => {
    expect(decodeMemberQr(encodeMemberQr("abc123"))).toBe("abc123");
  });

  it("prefixes with the JCI namespace", () => {
    expect(encodeMemberQr("abc123")).toBe("jcioriente:member:abc123");
  });

  it("rejects a foreign QR", () => {
    expect(decodeMemberQr("https://example.com")).toBeNull();
    expect(decodeMemberQr("jcioriente:ally:abc")).toBeNull();
  });

  it("rejects a missing or empty id", () => {
    expect(decodeMemberQr("jcioriente:member:")).toBeNull();
    expect(decodeMemberQr("")).toBeNull();
  });

  it("rejects an id with separators (defends the composite doc id)", () => {
    expect(decodeMemberQr("jcioriente:member:a/b")).toBeNull();
    expect(decodeMemberQr("jcioriente:member:a__b")).toBeNull();
  });
});
