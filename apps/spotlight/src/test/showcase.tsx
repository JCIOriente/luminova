import { render } from "@testing-library/react";
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

export function renderWithRouter(ui: ReactNode, extraPaths: string[] = ["/impacto/$id"]) {
  const rootRoute = createRootRoute({ component: () => <Outlet /> });
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/",
    component: () => <>{ui}</>,
  });
  const extras = extraPaths.map((path) =>
    createRoute({ getParentRoute: () => rootRoute, path, component: () => null }),
  );
  const router = createRouter({
    routeTree: rootRoute.addChildren([indexRoute, ...extras]),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  return render(<RouterProvider router={router} />);
}

export function makeShowcaseItem(overrides: Partial<ShowcaseItem> = {}): ShowcaseItem {
  return {
    id: "x",
    kind: "Project",
    featured: false,
    title: "T-x",
    description: "d",
    category: "DesarrolloComunitario",
    startDate: Timestamp.fromMillis(0),
    endDate: Timestamp.fromMillis(0),
    completedAt: Timestamp.fromMillis(1),
    impact: { personsImpacted: 10, volunteers: 2, custom: [], closingSummary: "s" },
    photos: [],
    team: { director: null, coDirectors: [], members: [] },
    ...overrides,
  } as unknown as ShowcaseItem;
}
