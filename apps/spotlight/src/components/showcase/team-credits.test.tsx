import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { TeamCredits } from "./team-credits";
import { renderWithRouter } from "../../test/showcase";

describe("TeamCredits", () => {
  it("links a credit with an id to the member's profile, and leaves a legacy credit as text", async () => {
    renderWithRouter(
      <TeamCredits
        team={{
          director: { id: "m1", name: "Ana", photoUrl: null },
          coDirectors: [],
          members: [{ name: "Caro", photoUrl: null }],
        }}
      />,
    );
    const link = await screen.findByRole("link", { name: "Ver perfil de Ana" });
    expect(link.getAttribute("href")).toContain("miembro=m1");
    expect(screen.queryByRole("link", { name: "Ver perfil de Caro" })).not.toBeInTheDocument();
    expect(screen.getByText("Caro")).toBeInTheDocument();
  });

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

  it("renders a photo avatar (decorative — name is the adjacent text) when photoUrl is present", () => {
    const { container } = render(
      <TeamCredits
        team={{
          director: { name: "Ana Lopez", photoUrl: "https://x/ana.jpg" },
          coDirectors: [],
          members: [],
        }}
      />,
    );
    const img = container.querySelector("img");
    expect(img).toHaveAttribute("src", "https://x/ana.jpg");
    expect(img).toHaveAttribute("alt", "");
    expect(screen.getByText("Ana Lopez")).toBeInTheDocument();
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
