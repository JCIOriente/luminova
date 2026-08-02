import { describe, expect, it } from "vitest";
import { Timestamp } from "firebase/firestore";
import type { Member } from "@luminova/types";
import { UPCOMING_BIRTHDAY_LIMIT, inDaysEs, upcomingBirthdays } from "./milestones";

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
    const [first] = result;
    expect(first?.label).not.toContain("1992");
    expect(first?.label).toMatch(/8.*jul/i);
    expect(first?.days).toBe(3);
  });

  it("excludes an expelled member (status wins over an untouched active flag)", () => {
    const expelled = { ...member("x", "Expulsado", "1990-07-06T00:00:00Z"), status: "Desafiliado" };
    const members = [expelled as Member, member("a", "Ana", "1992-07-08T00:00:00Z")];
    expect(
      upcomingBirthdays(members, "self", now, UPCOMING_BIRTHDAY_LIMIT).map((r) => r.id),
    ).toEqual(["a"]);
  });

  it("keeps every member when no self is excluded (the chapter dashboard view)", () => {
    const members = [
      member("a", "Ana", "1992-07-08T00:00:00Z"),
      member("b", "Beto", "1988-07-09T00:00:00Z"),
    ];
    expect(
      upcomingBirthdays(members, undefined, now, UPCOMING_BIRTHDAY_LIMIT).map((r) => r.id),
    ).toEqual(["a", "b"]);
  });
});

describe("inDaysEs", () => {
  it("reads naturally for today, tomorrow and beyond", () => {
    expect(inDaysEs(0)).toBe("hoy");
    expect(inDaysEs(1)).toBe("mañana");
    expect(inDaysEs(4)).toBe("en 4 días");
  });
});
