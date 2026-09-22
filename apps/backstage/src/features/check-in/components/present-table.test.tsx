import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Timestamp } from "firebase/firestore";
import type { RosterEntry } from "../roster";
import { PresentTable } from "./present-table";

function entry(checkInAt: Timestamp | null): RosterEntry {
  return {
    memberId: "m1",
    role: "Attendee",
    name: "Ana Rojas",
    profession: null,
    src: null,
    checkInAt,
  } as RosterEntry;
}

function renderTable(checkInAt: Timestamp | null) {
  render(<PresentTable entries={[entry(checkInAt)]} onRemove={() => {}} canRemove={() => false} />);
}

describe("PresentTable — check-in time", () => {
  it("renders the check-in on the BOLIVIAN clock, not UTC", () => {
    // `checkInAt` is written `serverTimestamp()` (check-in-repository.ts) — a real instant,
    // unlike an activity's startAt, which is a wall-clock deliberately pinned to UTC. It was
    // rendered with the UTC-pinned `formatTime`, so every arrival read four hours late for
    // the whole life of the feature: this 15:00 check-in showed "19:00" to the operator
    // standing next to the person who just walked in.
    renderTable(Timestamp.fromMillis(Date.parse("2026-09-21T19:00:00Z")));
    expect(screen.getByText("15:00")).toBeInTheDocument();
    expect(screen.queryByText("19:00")).not.toBeInTheDocument();
  });

  it("renders a dash when the check-in time is missing", () => {
    renderTable(null);
    expect(screen.getByText("—")).toBeInTheDocument();
  });
});
