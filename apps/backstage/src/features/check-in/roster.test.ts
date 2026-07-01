import { describe, it, expect } from "vitest";
import type { Timestamp } from "firebase/firestore";
import { alreadyCheckedIn, buildRosterEntries } from "./roster";
import type { Member } from "@luminova/types";

const ts = (ms: number) => ({ toMillis: () => ms }) as unknown as Timestamp;

const members = [
  { id: "m-1", name: "Bruno Paz", profession: "Ingeniero" },
  { id: "m-2", name: "Ana Rivas" },
] as Member[];
const checkIns = [
  { memberId: "m-2", role: "Attendee" as const, checkInAt: ts(200) },
  { memberId: "m-1", role: "Attendee" as const, checkInAt: ts(500) },
];

describe("roster", () => {
  it("detects an already-checked-in member", () => {
    expect(alreadyCheckedIn(checkIns, "m-1")).toBe(true);
    expect(alreadyCheckedIn(checkIns, "m-9")).toBe(false);
  });

  it("sorts by most-recent check-in first and carries profession", () => {
    const rows = buildRosterEntries(checkIns, members);
    expect(rows.map((r) => r.name)).toEqual(["Bruno Paz", "Ana Rivas"]);
    expect(rows[0]?.profession).toBe("Ingeniero");
    expect(rows[1]?.profession).toBeNull();
  });

  it("falls back to the id and a null avatar when the member is unknown", () => {
    const rows = buildRosterEntries(
      [{ memberId: "ghost", role: "Attendee", checkInAt: null }],
      members,
    );
    expect(rows[0]?.name).toBe("ghost");
    expect(rows[0]?.src).toBeNull();
  });
});
