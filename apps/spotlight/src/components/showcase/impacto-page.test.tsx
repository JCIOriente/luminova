import { describe, expect, it, vi } from "vitest";
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
import { ImpactoPage } from "./impacto-page";

const listState = vi.hoisted(() => ({
  data: [] as unknown[],
  loading: false,
  error: null as Error | null,
}));
vi.mock("../../showcase/use-showcase", () => ({
  useShowcaseList: () => listState,
}));

const mk = (id: string, featured: boolean): ShowcaseItem =>
  ({
    id,
    kind: "Project",
    featured,
    title: `T-${id}`,
    description: "d",
    category: "DesarrolloComunitario",
    startDate: Timestamp.fromMillis(0),
    endDate: Timestamp.fromMillis(0),
    completedAt: Timestamp.fromMillis(1),
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
