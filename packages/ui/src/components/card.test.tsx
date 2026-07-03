// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Card, cardInteractiveClasses, cardSurfaceClasses } from "./card";

afterEach(cleanup);

describe("Card", () => {
  it("renders a div with the surface recipe and default md padding", () => {
    render(<Card data-testid="card">contenido</Card>);
    const el = screen.getByTestId("card");
    expect(el.tagName).toBe("DIV");
    expect(el.className).toContain("rounded-card");
    expect(el.className).toContain("border-line");
    expect(el.className).toContain("bg-surface");
    expect(el.className).toContain("p-5");
  });

  it("renders the element given by `as`", () => {
    render(<Card as="section" data-testid="card" />);
    expect(screen.getByTestId("card").tagName).toBe("SECTION");
  });

  it("padding sm maps to p-4 and none drops padding entirely", () => {
    render(
      <>
        <Card padding="sm" data-testid="sm" />
        <Card padding="none" data-testid="none" />
      </>,
    );
    expect(screen.getByTestId("sm").className).toContain("p-4");
    expect(screen.getByTestId("none").className).not.toMatch(/\bp-\d/);
  });

  it("interactive adds the shared lift recipe", () => {
    render(<Card interactive data-testid="card" />);
    expect(screen.getByTestId("card").className).toContain("hover:-translate-y-0.5");
    render(<Card data-testid="static" />);
    expect(screen.getByTestId("static").className).not.toContain("hover:-translate-y-0.5");
  });

  it("merges className last so callers can override the recipe", () => {
    render(<Card className="bg-surface-2 shadow-none" data-testid="card" />);
    const cls = screen.getByTestId("card").className;
    expect(cls).toContain("bg-surface-2");
    expect(cls).not.toContain("bg-surface ");
    expect(cls).toContain("shadow-none");
  });

  it("exports the recipe strings for button/Link hosts", () => {
    expect(cardSurfaceClasses).toContain("rounded-card");
    expect(cardSurfaceClasses).toContain("shadow-");
    expect(cardInteractiveClasses).toContain("focus-visible:outline-2");
    expect(cardInteractiveClasses).toContain("motion-reduce:hover:translate-y-0");
  });
});
