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
import type { ShowcaseItem } from "@luminova/types/engine";
import { DetailContent } from "./impacto.$id";

const mkItem = (kind: ShowcaseItem["kind"]): ShowcaseItem =>
  ({
    id: "x",
    kind,
    featured: false,
    title: "Titulo X",
    description: "desc",
    category: "DesarrolloComunitario",
    startDate: Timestamp.fromMillis(0),
    endDate: Timestamp.fromMillis(86400000),
    completedAt: Timestamp.fromMillis(86400000),
    impact: { personsImpacted: 10, volunteers: 2, custom: [], closingSummary: "resumen" },
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
  const impactoRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/impacto",
    component: () => null,
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([indexRoute, impactoRoute]),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  return render(<RouterProvider router={router} />);
}

describe("DetailContent kind awareness", () => {
  it("shows Programa anual chip and El programa eyebrow for Program", async () => {
    renderWithRouter(<DetailContent item={mkItem("Program")} />);
    expect(await screen.findByText("Programa anual")).toBeInTheDocument();
    expect(screen.getByText("El programa")).toBeInTheDocument();
  });
  it("shows El proyecto eyebrow and no chip for Project", async () => {
    renderWithRouter(<DetailContent item={mkItem("Project")} />);
    expect(await screen.findByText("El proyecto")).toBeInTheDocument();
    expect(screen.queryByText("Programa anual")).not.toBeInTheDocument();
  });
});
