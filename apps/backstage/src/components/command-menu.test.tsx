import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";

const navigate = vi.fn();
vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => navigate,
}));

const currentRoles = { value: [] as Role[] };
vi.mock("../lib/auth/auth", () => ({
  useAuth: () => ({ status: "authenticated", user: null, claims: { roles: currentRoles.value } }),
}));

import { CommandMenu } from "./command-menu";
import { AbilityProvider } from "../lib/authz/ability-context";
import { setCommandMenuOpen } from "./command-menu-store";
import type { Role } from "@luminova/auth/roles";

function renderWithRoles(ui: ReactElement, roles: Role[]) {
  currentRoles.value = roles;
  return render(
    <AbilityProvider claims={{ roles }} uid="u1">
      {ui}
    </AbilityProvider>,
  );
}

describe("CommandMenu", () => {
  beforeEach(() => {
    navigate.mockReset();
    setCommandMenuOpen(false);
  });

  it("opens on ⌘K and navigates when a nav item is chosen", async () => {
    renderWithRoles(<CommandMenu />, ["Admin"]);
    expect(screen.queryByText("Inicio")).toBeNull();

    await userEvent.keyboard("{Meta>}k{/Meta}");
    expect(await screen.findByText("Inicio")).toBeInTheDocument();

    await userEvent.click(screen.getByText("Miembros"));
    expect(navigate).toHaveBeenCalledWith({ to: "/members" });
  });

  it("opens on Ctrl+K too", async () => {
    renderWithRoles(<CommandMenu />, ["Admin"]);
    await userEvent.keyboard("{Control>}k{/Control}");
    expect(await screen.findByText("Inicio")).toBeInTheDocument();
  });

  it("omits items the caller's ability denies", async () => {
    renderWithRoles(<CommandMenu />, ["Treasury"]);
    await userEvent.keyboard("{Meta>}k{/Meta}");
    await screen.findByText("Inicio");
    expect(screen.queryByText("Aliados")).toBeNull();
    expect(screen.queryByText("Invitar miembro")).toBeNull();
  });

  it("hides Proyectos when ability can read neither Program nor Project", async () => {
    renderWithRoles(<CommandMenu />, ["Treasury"]);
    await userEvent.keyboard("{Meta>}k{/Meta}");
    await screen.findByText("Inicio");
    expect(screen.queryByText("Proyectos")).toBeNull();
  });
});
