import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { SiteLinktree } from "@luminova/types";
import { LinktreePage } from "./linktree";

const linktree: SiteLinktree = {
  handle: "@jci.oriente",
  tagline: "Sé el cambio.",
  taglineAccent: "Become the Change.",
  links: [
    {
      id: "1",
      icon: "user",
      title: "Únete ya",
      description: "desc",
      url: "https://wa.me/591",
      isPrimary: true,
      badge: "Únete",
      active: true,
    },
    {
      id: "2",
      icon: "mail",
      title: "Escríbenos",
      description: "correo",
      url: "javascript:alert(1)",
      isPrimary: false,
      active: true,
    },
    {
      id: "3",
      icon: "globe",
      title: "Oculto",
      description: "no debe verse",
      url: "https://x.test",
      isPrimary: false,
      active: false,
    },
  ],
  socials: [
    { platform: "instagram", url: "https://instagram.com/jci" },
    { platform: "facebook", url: "https://facebook.com/jci" },
    { platform: "tiktok", url: "https://tiktok.com/@jci" },
  ],
};

vi.mock("../site-config/use-site-config", () => ({
  useSiteConfig: () => ({ linktree, contact: { location: "Santa Cruz, Bolivia" } }),
}));

describe("LinktreePage", () => {
  it("renders only active links", () => {
    render(<LinktreePage />);
    expect(screen.getByText("Únete ya")).toBeInTheDocument();
    expect(screen.getByText("Escríbenos")).toBeInTheDocument();
    expect(screen.queryByText("Oculto")).not.toBeInTheDocument();
  });
  it("renders the badge on a flagged link", () => {
    render(<LinktreePage />);
    expect(screen.getByText("Únete")).toBeInTheDocument();
  });
  it("marks the primary link", () => {
    render(<LinktreePage />);
    const primary = screen.getByText("Únete ya").closest("a");
    expect(primary?.className).toContain("is-primary");
  });
  it("neutralizes a javascript: url to #", () => {
    render(<LinktreePage />);
    const link = screen.getByText("Escríbenos").closest("a");
    expect(link?.getAttribute("href")).toBe("#");
  });
  it("renders the three socials with accessible names", () => {
    render(<LinktreePage />);
    expect(screen.getByLabelText("Instagram")).toBeInTheDocument();
    expect(screen.getByLabelText("Facebook")).toBeInTheDocument();
    expect(screen.getByLabelText("TikTok")).toBeInTheDocument();
  });
  it("renders the contact location in the footer", () => {
    render(<LinktreePage />);
    expect(screen.getByText("Santa Cruz, Bolivia")).toBeInTheDocument();
  });
});
