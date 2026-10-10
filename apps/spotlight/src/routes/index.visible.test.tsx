import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import type { ComponentType } from "react";
import { makeShowcaseItem, renderWithRouter } from "../test/showcase";
import { Route } from "./index";

const fetchFeatured = vi.hoisted(() => vi.fn());

// Only the network read and its cache are replaced: the real on-visible hook, sentinel and
// section run, so the sentinel -> section swap is exercised end to end.
vi.mock("../showcase/showcase-firestore", async () => {
  const { makeResourceCache } = await import("../lib/cached-resource");
  return {
    fetchFeatured,
    fetchShowcaseItem: vi.fn(),
    fetchShowcaseList: vi.fn(),
    featuredCache: makeResourceCache({ key: "test.featured" }),
    showcaseListCache: makeResourceCache({ key: "test.showcase" }),
  };
});

vi.mock("../allies/use-allies", () => ({
  useAlliesOnVisible: () => ({ data: [], loading: false, error: false, ref: () => {} }),
}));

vi.mock("../site-config/use-site-config", async () => {
  const { SITE_CONFIG_DEFAULTS } = await import("../site-config/defaults");
  return { useSiteConfig: () => SITE_CONFIG_DEFAULTS };
});

const Home = Route.options.component as ComponentType;

const FEATURED_HEADING = "El trabajo que nos enorgullece.";

describe("home featured projects, real on-visible flow", () => {
  beforeEach(() => {
    fetchFeatured.mockReset();
    vi.stubGlobal(
      "IntersectionObserver",
      class {
        constructor(private cb: IntersectionObserverCallback) {}
        observe() {
          this.cb([{ isIntersecting: true } as IntersectionObserverEntry], this as never);
        }
        disconnect() {}
        unobserve() {}
        takeRecords() {
          return [];
        }
      },
    );
  });

  it("swaps the sentinel for the section once the visible read returns projects", async () => {
    fetchFeatured.mockResolvedValue([
      makeShowcaseItem({ id: "a", title: "Proyecto Alfa", featured: true }),
    ]);
    renderWithRouter(<Home />, ["/impacto"]);
    expect(await screen.findByText(FEATURED_HEADING)).toBeInTheDocument();
    expect(await screen.findByText("Proyecto Alfa")).toBeInTheDocument();
    expect(fetchFeatured).toHaveBeenCalledTimes(1);
  });

  it("keeps the section out when the visible read returns nothing", async () => {
    fetchFeatured.mockResolvedValue([]);
    renderWithRouter(<Home />, ["/impacto"]);
    await screen.findByRole("heading", { level: 1 });
    await vi.waitFor(() => expect(fetchFeatured).toHaveBeenCalledTimes(1));
    expect(screen.queryByText(FEATURED_HEADING)).not.toBeInTheDocument();
  });
});
