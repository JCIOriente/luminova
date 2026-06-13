import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  RouterProvider,
  createRootRoute,
  createRoute,
  createRouter,
  createMemoryHistory,
  Outlet,
} from "@tanstack/react-router";
import type { ReactNode } from "react";
import { Timestamp } from "firebase/firestore";
import { ShowcaseGrid } from "./showcase-grid";
import type { ShowcaseItem } from "@luminova/types/engine";

const mk = (id: string, ms: number, category: ShowcaseItem["category"]): ShowcaseItem =>
  ({
    id,
    kind: "Project",
    title: `T-${id}`,
    description: "d",
    category,
    startDate: Timestamp.fromMillis(0),
    endDate: Timestamp.fromMillis(0),
    completedAt: Timestamp.fromMillis(ms),
    impact: { personsImpacted: 10, volunteers: 2, custom: [], closingSummary: "s" },
    photos: [],
    team: { director: null, coDirectors: [], members: [] },
  }) as unknown as ShowcaseItem;

function renderWithRouter(ui: ReactNode) {
  const rootRoute = createRootRoute({ component: () => <Outlet /> });
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/",
    component: () => <>{ui}</>,
  });
  const detailRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/impacto/$id",
    component: () => null,
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([indexRoute, detailRoute]),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  return render(<RouterProvider router={router} />);
}

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
});
