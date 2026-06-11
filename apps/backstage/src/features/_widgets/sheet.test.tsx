import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Sheet, type SheetSize } from "@luminova/ui";

function renderSheet(size?: SheetSize) {
  render(
    <Sheet open onOpenChange={() => {}} title="Prueba" size={size}>
      <p>contenido</p>
    </Sheet>,
  );
}

describe("Sheet", () => {
  it("defaults to the 440px width", () => {
    renderSheet();
    expect(screen.getByRole("dialog").className).toContain("max-w-[440px]");
  });

  it("applies the requested width", () => {
    renderSheet("lg");
    expect(screen.getByRole("dialog").className).toContain("max-w-[680px]");
  });
});
