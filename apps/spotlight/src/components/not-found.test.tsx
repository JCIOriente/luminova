import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithRouter } from "../test/showcase";
import { SITE_CONFIG_DEFAULTS } from "../site-config/defaults";
import { NotFound } from "./not-found";

const config = vi.hoisted(() => ({ submotto: "" }));

vi.mock("../site-config/use-site-config", async () => {
  const { SITE_CONFIG_DEFAULTS } = await import("../site-config/defaults");
  return {
    useSiteConfig: () => ({
      ...SITE_CONFIG_DEFAULTS,
      hero: { motto: "Inspire", submotto: config.submotto },
    }),
  };
});

describe("404 tagline", () => {
  beforeEach(() => {
    config.submotto = "";
  });

  it("shows the sub-motto loaded from the database when there is one", async () => {
    config.submotto = "Un sublema de prueba.";
    renderWithRouter(<NotFound />, []);
    expect(await screen.findByText("Un sublema de prueba.")).toBeInTheDocument();
  });

  it("falls back to the default motto, never the database motto, when there is no sub-motto", async () => {
    renderWithRouter(<NotFound />, []);
    expect(await screen.findByText(SITE_CONFIG_DEFAULTS.hero.motto)).toBeInTheDocument();
    expect(screen.queryByText("Inspire")).not.toBeInTheDocument();
  });
});
