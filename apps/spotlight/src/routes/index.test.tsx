import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import type { ComponentType } from "react";
import type { ShowcaseItem } from "@luminova/types/engine";
import { makeShowcaseItem, renderWithRouter } from "../test/showcase";
import { Route } from "./index";

const featured = vi.hoisted(() => ({
  state: { data: [] as ShowcaseItem[], loading: false, error: false },
}));

vi.mock("../showcase/use-showcase", () => ({
  useFeaturedListOnVisible: () => ({ ...featured.state, ref: () => {} }),
}));

vi.mock("../allies/use-allies", () => ({
  useAlliesOnVisible: () => ({ data: [], loading: false, error: false, ref: () => {} }),
}));

vi.mock("../site-config/use-site-config", async () => {
  const { SITE_CONFIG_DEFAULTS } = await import("../site-config/defaults");
  return { useSiteConfig: () => SITE_CONFIG_DEFAULTS };
});

// Route files export only `Route` (autoCodeSplitting), so the page is reached through it.
const Home = Route.options.component as ComponentType;

const FEATURED_HEADING = "El trabajo que nos enorgullece.";

// The router mounts asynchronously: wait for the hero before asserting anything is absent,
// or every "not in the document" check passes before the page has rendered.
async function renderHome() {
  renderWithRouter(<Home />, ["/impacto"]);
  await screen.findByRole("heading", { level: 1 });
}

describe("home featured projects", () => {
  beforeEach(() => {
    featured.state = { data: [], loading: false, error: false };
    Element.prototype.scrollIntoView = vi.fn();
  });

  it("hides the whole section, link included, when there are no featured projects", async () => {
    await renderHome();
    expect(screen.queryByText(FEATURED_HEADING)).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /ver nuestro impacto/i })).not.toBeInTheDocument();
  });

  it("hides the section when the featured read failed", async () => {
    featured.state = { data: [], loading: false, error: true };
    await renderHome();
    expect(screen.queryByText(FEATURED_HEADING)).not.toBeInTheDocument();
  });

  it("hides the section while the featured read is still loading", async () => {
    featured.state = { data: [], loading: true, error: false };
    await renderHome();
    expect(screen.queryByText(FEATURED_HEADING)).not.toBeInTheDocument();
  });

  it("shows the section with its projects when there are some", async () => {
    featured.state = {
      data: [makeShowcaseItem({ id: "a", title: "Proyecto Alfa", featured: true })],
      loading: false,
      error: false,
    };
    await renderHome();
    expect(await screen.findByText(FEATURED_HEADING)).toBeInTheDocument();
    expect(await screen.findByText("Proyecto Alfa")).toBeInTheDocument();
  });

  it("hero button scrolls to the section when it exists", async () => {
    featured.state = {
      data: [makeShowcaseItem({ id: "a", title: "Proyecto Alfa", featured: true })],
      loading: false,
      error: false,
    };
    await renderHome();
    await screen.findByText(FEATURED_HEADING);
    fireEvent.click(screen.getByText("Ver nuestros proyectos"));
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
    expect(screen.getByText(FEATURED_HEADING)).toBeInTheDocument();
  });

  it("hero button goes to /impacto instead of scrolling to nothing when the section is hidden", async () => {
    await renderHome();
    fireEvent.click(screen.getByText("Ver nuestros proyectos"));
    await waitFor(() => expect(screen.queryByText("Ver nuestros proyectos")).toBeNull());
    expect(Element.prototype.scrollIntoView).not.toHaveBeenCalled();
  });
});
