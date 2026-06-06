import { describe, it, expect } from "vitest";
import { alreadyCheckedIn, buildRosterEntries } from "./roster";
import type { Member } from "@luminova/types";

const members = [
  { id: "m-1", name: "Bruno Paz" },
  { id: "m-2", name: "Ana Rivas" },
] as Member[];
const checkIns = [
  { memberId: "m-2", role: "Attendee" as const },
  { memberId: "m-1", role: "Attendee" as const },
];

describe("roster", () => {
  it("detects an already-checked-in member", () => {
    expect(alreadyCheckedIn(checkIns, "m-1")).toBe(true);
    expect(alreadyCheckedIn(checkIns, "m-9")).toBe(false);
  });

  it("resolves names and sorts by name (es)", () => {
    const rows = buildRosterEntries(checkIns, members);
    expect(rows.map((r) => r.name)).toEqual(["Ana Rivas", "Bruno Paz"]);
  });

  it("falls back to the id when the member is unknown", () => {
    const rows = buildRosterEntries([{ memberId: "ghost", role: "Attendee" }], members);
    expect(rows[0]?.name).toBe("ghost");
  });
});
