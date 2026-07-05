// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Dialog } from "./dialog";

afterEach(cleanup);

describe("Dialog", () => {
  it("renders a visible title by default", () => {
    render(
      <Dialog open onOpenChange={vi.fn()} title="Confirmar">
        <p>body</p>
      </Dialog>,
    );
    expect(screen.getByRole("heading", { name: "Confirmar" })).not.toHaveClass("sr-only");
    expect(screen.getByRole("dialog", { name: "Confirmar" })).toBeInTheDocument();
  });

  it("keeps the title as the accessible name when hideHeader is set", () => {
    render(
      <Dialog open onOpenChange={vi.fn()} title="Lector de check-in" hideHeader>
        <p>body</p>
      </Dialog>,
    );
    expect(screen.getByRole("dialog", { name: "Lector de check-in" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Lector de check-in" })).toHaveClass("sr-only");
  });

  it("lets contentClassName override the default surface and padding", () => {
    render(
      <Dialog open onOpenChange={vi.fn()} title="x" hideHeader contentClassName="bg-jci-black p-0">
        <p>b</p>
      </Dialog>,
    );
    const content = screen.getByRole("dialog");
    expect(content).toHaveClass("bg-jci-black", "p-0");
    expect(content).not.toHaveClass("bg-surface");
    expect(content).not.toHaveClass("p-[26px]");
  });

  it("merges overlayClassName last over the default scrim", () => {
    render(
      <Dialog open onOpenChange={vi.fn()} title="x" overlayClassName="bg-jci-black/70">
        <p>b</p>
      </Dialog>,
    );
    const overlay = document.querySelector('[data-state="open"].fixed.inset-0');
    expect(overlay?.className).toContain("bg-jci-black/70");
    expect(overlay?.className).not.toContain("bg-jci-black/40");
  });
});
