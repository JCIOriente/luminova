import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { SITE_CONFIG_DEFAULTS } from "../site-config/defaults";
import { NotFound } from "./not-found";

vi.mock("@tanstack/react-router", () => ({ useNavigate: () => vi.fn() }));

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

  it("shows the sub-motto loaded from the database when there is one", () => {
    config.submotto = "Un sublema de prueba.";
    render(<NotFound />);
    expect(screen.getByText("Un sublema de prueba.")).toBeInTheDocument();
  });

  it("falls back to the default motto, never the database motto, when there is no sub-motto", () => {
    render(<NotFound />);
    expect(screen.getByText(SITE_CONFIG_DEFAULTS.hero.motto)).toBeInTheDocument();
    expect(screen.queryByText("Inspire")).not.toBeInTheDocument();
  });
});
