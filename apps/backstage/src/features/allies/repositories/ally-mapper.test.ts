import { describe, it, expect } from "vitest";
import { toAllyCreateDoc, toAllyUpdateDoc } from "./ally-mapper";

const base = {
  companyName: "ACME",
  contactPerson: "Ana Lopez",
  phone: "1",
  email: "a@b.co",
} as const;

describe("ally-mapper", () => {
  it("create doc defaults logoUrl null + category null", () => {
    expect(toAllyCreateDoc(base)).toMatchObject({
      logoUrl: null,
      category: null,
      active: true,
      deletedAt: null,
    });
  });
  it("create doc carries a set category", () => {
    expect(toAllyCreateDoc({ ...base, category: "University" })).toMatchObject({
      category: "University",
    });
  });
  it("update doc never touches logoUrl or system fields", () => {
    const out = toAllyUpdateDoc({ ...base, category: "Company" });
    expect(out).toMatchObject({ category: "Company" });
    expect(out).not.toHaveProperty("logoUrl");
    expect(out).not.toHaveProperty("active");
  });
});
