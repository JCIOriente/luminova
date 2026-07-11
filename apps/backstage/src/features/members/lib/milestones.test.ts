import { describe, expect, it } from "vitest";
import { Timestamp } from "firebase/firestore";
import type { Member } from "@luminova/types";
import { upcomingBirthdays } from "./milestones";

function member(id: string, name: string, birthIso: string, active = true): Member {
  return {
    id,
    name,
    active,
    birthdate: Timestamp.fromDate(new Date(birthIso)),
  } as unknown as Member;
}

const now = new Date("2026-07-05T16:00:00Z"); // Bolivia Jul 5, 2026

describe("upcomingBirthdays", () => {
  it("orders by soonest birthday and excludes self + inactive", () => {
    const members = [
      member("self", "Yo", "1990-07-06T00:00:00Z"),
      member("a", "Ana", "1992-07-20T00:00:00Z"),
      member("b", "Beto", "1988-07-08T00:00:00Z"),
      member("c", "Cinthia", "1995-07-01T00:00:00Z"), // already passed → rolls to next year (last)
      member("d", "Dead", "1980-07-07T00:00:00Z", false),
    ];
    const result = upcomingBirthdays(members, "self", now, 5);
    expect(result.map((r) => r.id)).toEqual(["b", "a", "c"]);
  });

  it("caps at the limit and labels day/month with no year", () => {
    const members = [
      member("a", "Ana", "1992-07-08T00:00:00Z"),
      member("b", "Beto", "1988-07-09T00:00:00Z"),
      member("c", "Cinthia", "1995-07-10T00:00:00Z"),
    ];
    const result = upcomingBirthdays(members, "self", now, 2);
    expect(result).toHaveLength(2);
    expect(result[0].label).not.toContain("1992");
    expect(result[0].label).toMatch(/8.*jul/i);
    expect(result[0].days).toBe(3);
  });
});
