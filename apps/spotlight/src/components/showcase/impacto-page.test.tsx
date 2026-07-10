import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { makeShowcaseItem, renderWithRouter } from "../../test/showcase";
import { ImpactoPage } from "./impacto-page";

const listState = vi.hoisted(() => ({
  data: [] as unknown[],
  loading: false,
  error: null as Error | null,
}));
vi.mock("../../showcase/use-showcase", () => ({
  useShowcaseList: () => listState,
}));

const mk = (id: string, featured: boolean) => makeShowcaseItem({ id, title: `T-${id}`, featured });

describe("ImpactoPage", () => {
  it("labels the count stat proyectos completados", async () => {
    listState.data = [mk("a", false), mk("b", true)];
    renderWithRouter(<ImpactoPage />);
    expect(await screen.findByText("proyectos completados")).toBeInTheDocument();
  });
  it("renders the Destacados band only when featured items exist", async () => {
    listState.data = [mk("a", false), mk("b", true)];
    renderWithRouter(<ImpactoPage />);
    expect(await screen.findByText("Destacados")).toBeInTheDocument();
    expect(screen.getAllByText("T-b").length).toBe(2);
  });
  it("hides the Destacados band when nothing is featured", async () => {
    listState.data = [mk("a", false)];
    renderWithRouter(<ImpactoPage />);
    expect(await screen.findByText("T-a")).toBeInTheDocument();
    expect(screen.queryByText("Destacados")).not.toBeInTheDocument();
  });
});
