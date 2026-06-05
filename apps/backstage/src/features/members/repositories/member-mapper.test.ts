import { describe, it, expect } from "vitest";
import { Timestamp } from "firebase/firestore";
import { toMemberCreateDoc, toMemberUpdateDoc, dateInputValue } from "./member-mapper";
import type { MemberInput } from "../types/member-schema";

const input: MemberInput = {
  name: "Ana Pérez",
  email: "ana@jci.bo",
  phone: "777",
  role: "Presidenta",
  profession: "Ingeniera",
  joinDate: "2020-03-15",
  birthdate: "1992-07-01",
  status: "Activo",
};

describe("toMemberCreateDoc", () => {
  it("sets system defaults for a new member", () => {
    const doc = toMemberCreateDoc(input);
    expect(doc).toMatchObject({
      name: "Ana Pérez",
      email: "ana@jci.bo",
      phone: "777",
      role: "Presidenta",
      profession: "Ingeniera",
      status: "Activo",
      profilePicture: null,
      totalPoints: 0,
      active: true,
      deletedAt: null,
    });
  });

  it("converts date strings to Timestamps", () => {
    const doc = toMemberCreateDoc(input);
    expect(doc.joinDate).toBeInstanceOf(Timestamp);
    expect(dateInputValue(doc.joinDate)).toBe("2020-03-15");
    expect(dateInputValue(doc.birthdate)).toBe("1992-07-01");
  });

  it("stores empty string for omitted optional fields", () => {
    const doc = toMemberCreateDoc({ ...input, phone: undefined, profession: undefined });
    expect(doc.phone).toBe("");
    expect(doc.profession).toBe("");
  });
});

describe("toMemberUpdateDoc", () => {
  it("includes editable fields but not system fields", () => {
    const doc = toMemberUpdateDoc(input);
    expect(doc).toMatchObject({ name: "Ana Pérez", status: "Activo" });
    expect(doc).not.toHaveProperty("active");
    expect(doc).not.toHaveProperty("totalPoints");
    expect(doc).not.toHaveProperty("deletedAt");
    expect(doc).not.toHaveProperty("profilePicture");
  });
});

describe("dateInputValue", () => {
  it("formats a Timestamp as YYYY-MM-DD (UTC)", () => {
    const ts = Timestamp.fromDate(new Date("2001-12-09T00:00:00Z"));
    expect(dateInputValue(ts)).toBe("2001-12-09");
  });
});
