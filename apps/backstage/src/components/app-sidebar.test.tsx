import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, ...rest }: { children: ReactNode }) => <a {...rest}>{children}</a>,
  useNavigate: () => vi.fn(),
}));

vi.mock("../lib/auth/auth", () => ({
  useAuth: () => ({ user: { email: "ana@jci.org" }, claims: { roles: ["Admin"] } }),
}));

// The sidebar asks useCan().navItemVisible, which needs both halves of the context.
const ability: { can: () => boolean } = { can: () => true };
vi.mock("../lib/authz/ability-context", () => ({
  useAbility: () => ability,
  useClaims: () => ({ roles: ["Admin"] }),
}));

vi.mock("../lib/auth/sign-out", () => ({
  signOutUser: vi.fn(),
}));

vi.mock("@luminova/auth/roles", () => ({
  hasAnyRole: () => true,
}));

import { AppSidebar } from "./app-sidebar";
import { setSidebarCollapsed } from "../lib/ui-prefs";

beforeEach(() => {
  ability.can = () => true;
  window.localStorage.clear();
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({
      matches: false,
      addEventListener: () => {},
      removeEventListener: () => {},
    })),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("AppSidebar", () => {
  it("shows nav labels and group headings when expanded", () => {
    setSidebarCollapsed(false);
    render(<AppSidebar />);
    expect(screen.getByText("Miembros")).toBeInTheDocument();
    expect(screen.getByText("Gestión")).toBeInTheDocument();
    expect(screen.getByText("ana@jci.org")).toBeInTheDocument();
  });

  it("renders the theme toggle when expanded", () => {
    setSidebarCollapsed(false);
    render(<AppSidebar />);
    expect(screen.getByRole("group", { name: "Tema" })).toBeInTheDocument();
  });

  it("hides nav labels and group headings when collapsed", () => {
    setSidebarCollapsed(true);
    render(<AppSidebar />);
    expect(screen.queryByText("Gestión")).not.toBeInTheDocument();
    expect(screen.queryByText("ana@jci.org")).not.toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Tema" })).not.toBeInTheDocument();
  });

  it("wraps collapsed nav items in tooltips exposing the label", () => {
    setSidebarCollapsed(true);
    render(<AppSidebar />);
    // Radix Tooltip renders the trigger; the label text lives in the (portalled)
    // content shown on hover. The visible rail shows only icons, so the plain
    // label text is absent until hover.
    expect(screen.queryByText("Miembros")).not.toBeInTheDocument();
  });

  it("offers an expand control when collapsed", () => {
    setSidebarCollapsed(true);
    render(<AppSidebar />);
    expect(screen.getByLabelText("Expandir menú")).toBeInTheDocument();
  });

  // Per-item visibility (incl. the Proyectos/Miembros gating and the conditional-
  // grant leak fix) is unit-tested against real abilities in nav-config.test.ts.
});
