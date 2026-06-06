import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import type { LeaderboardEntry } from "../leaderboard";
import { LeaderboardTable } from "./leaderboard-table";

const entries: LeaderboardEntry[] = [
  { rank: 1, memberId: "a", name: "Ana", points: 42, isBestOfMonth: true },
  { rank: 2, memberId: "b", name: "Bruno", points: 31, isBestOfMonth: false },
  { rank: 3, memberId: "c", name: "Carla", points: 28, isBestOfMonth: false },
  { rank: 4, memberId: "d", name: "Diego", points: 12, isBestOfMonth: false },
];

describe("LeaderboardTable", () => {
  it("renders each entry with rank, name and points", () => {
    render(<LeaderboardTable entries={entries} />);
    expect(screen.getByText("Ana")).toBeInTheDocument();
    expect(screen.getByText("42")).toBeInTheDocument();
    expect(screen.getByText("Diego")).toBeInTheDocument();
    expect(screen.getByText("4")).toBeInTheDocument();
  });

  it("marks the best of month", () => {
    render(<LeaderboardTable entries={entries} />);
    expect(screen.getByText(/mejor del mes/i)).toBeInTheDocument();
  });

  it("shows an empty state when there are no entries", () => {
    render(<LeaderboardTable entries={[]} />);
    expect(screen.getByText(/aún no hay puntos/i)).toBeInTheDocument();
  });
});
