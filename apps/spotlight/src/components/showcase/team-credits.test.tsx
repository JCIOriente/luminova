import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { TeamCredits } from "./team-credits";

describe("TeamCredits", () => {
  it("renders director + co-directors + members by name", () => {
    render(
      <TeamCredits
        team={{
          director: { name: "Ana", photoUrl: null },
          coDirectors: [{ name: "Beto", photoUrl: null }],
          members: [{ name: "Caro", photoUrl: null }],
        }}
      />,
    );
    expect(screen.getByText("Ana")).toBeInTheDocument();
    expect(screen.getByText("Beto")).toBeInTheDocument();
    expect(screen.getByText("Caro")).toBeInTheDocument();
  });
  it("omits director block when null", () => {
    render(<TeamCredits team={{ director: null, coDirectors: [], members: [] }} />);
    expect(screen.queryByText(/dirección|director/i)).not.toBeInTheDocument();
  });
});
