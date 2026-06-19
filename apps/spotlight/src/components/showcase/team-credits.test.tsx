import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { TeamCredits, initials } from "./team-credits";

describe("initials", () => {
  it("takes the first letter of up to two name parts, uppercased", () => {
    expect(initials("Ana")).toBe("A");
    expect(initials("Ana López")).toBe("AL");
    expect(initials("ana maría lópez")).toBe("AM");
  });
});

describe("TeamCredits", () => {
  it("renders director, co-directors and members by name", () => {
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

  it("renders a photo avatar when photoUrl is present", () => {
    render(
      <TeamCredits
        team={{
          director: { name: "Ana Lopez", photoUrl: "https://x/ana.jpg" },
          coDirectors: [],
          members: [],
        }}
      />,
    );
    expect(screen.getByAltText("Ana Lopez")).toHaveAttribute("src", "https://x/ana.jpg");
  });

  it("falls back to an initials monogram when photoUrl is null", () => {
    render(
      <TeamCredits
        team={{ director: { name: "Ana Lopez", photoUrl: null }, coDirectors: [], members: [] }}
      />,
    );
    expect(screen.queryByAltText("Ana Lopez")).toBeNull();
    expect(screen.getByText("AL")).toBeInTheDocument();
  });

  it("omits the whole block when there is no team", () => {
    const { container } = render(
      <TeamCredits team={{ director: null, coDirectors: [], members: [] }} />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
