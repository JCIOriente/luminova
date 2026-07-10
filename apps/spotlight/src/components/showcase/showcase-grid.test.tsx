import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import { Timestamp } from "firebase/firestore";
import { ShowcaseGrid } from "./showcase-grid";
import type { ShowcaseItem } from "@luminova/types/engine";
import { makeShowcaseItem, renderWithRouter } from "../../test/showcase";

const mk = (
  id: string,
  ms: number,
  category: ShowcaseItem["category"],
  kind: ShowcaseItem["kind"] = "Project",
): ShowcaseItem =>
  makeShowcaseItem({ id, title: `T-${id}`, category, kind, completedAt: Timestamp.fromMillis(ms) });

describe("ShowcaseGrid", () => {
  it("renders empty state when no items", async () => {
    renderWithRouter(<ShowcaseGrid items={[]} />);
    expect(await screen.findByText(/pronto|aún no|próximamente/i)).toBeInTheDocument();
  });
  it("renders a card per item", async () => {
    renderWithRouter(
      <ShowcaseGrid
        items={[mk("a", 1, "DesarrolloIndividual"), mk("b", 2, "DesarrolloComunitario")]}
      />,
    );
    expect(await screen.findByText("T-a")).toBeInTheDocument();
    expect(await screen.findByText("T-b")).toBeInTheDocument();
  });
  it("renders the Programa anual chip only for Program kind", async () => {
    renderWithRouter(
      <ShowcaseGrid
        items={[
          mk("prog", 2, "DesarrolloIndividual", "Program"),
          mk("proj", 1, "DesarrolloComunitario"),
        ]}
      />,
    );
    expect(await screen.findByText("Programa anual")).toBeInTheDocument();
    expect(screen.getAllByText("Programa anual")).toHaveLength(1);
  });
});
