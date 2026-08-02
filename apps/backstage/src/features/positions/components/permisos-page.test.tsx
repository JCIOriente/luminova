import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { ReactElement, ReactNode } from "react";
import type { AuthClaims } from "@luminova/auth/roles";

const emptyQuery = { data: [], isLoading: false, isError: false, error: null, refetch: vi.fn() };
vi.mock("../hooks/use-positions", () => ({ usePositions: () => emptyQuery }));
vi.mock("../../members/hooks/use-members", () => ({ useMembers: () => emptyQuery }));
vi.mock("../../permissions/hooks/use-roles", () => ({ useRoles: () => emptyQuery }));
vi.mock("../../permissions/components/roles-panel", () => ({
  RolesPanel: () => <div data-testid="roles-panel" />,
}));
vi.mock("@tanstack/react-router", async (orig) => ({
  ...(await orig<typeof import("@tanstack/react-router")>()),
  Link: (props: { to: string; children: ReactNode }) => <a href={props.to}>{props.children}</a>,
}));

import { PermisosPage } from "./permisos-page";
import { AbilityProvider } from "../../../lib/authz/ability-context";

function renderWith(claims: AuthClaims, ui: ReactElement) {
  return render(
    <AbilityProvider claims={claims} uid="u">
      {ui}
    </AbilityProvider>,
  );
}

describe("PermisosPage — Admin-role gate", () => {
  it("renders the single roles panel for an Admin", () => {
    renderWith({ roles: ["Admin"], perms: ["manage:all"] }, <PermisosPage />);
    expect(screen.getByRole("heading", { name: /permisos/i })).toBeInTheDocument();
    expect(screen.getByTestId("roles-panel")).toBeInTheDocument();
  });

  it("blocks a non-Admin (even with manage:all perm) with No autorizado", () => {
    renderWith({ roles: ["Member"], perms: ["manage:all"] }, <PermisosPage />);
    expect(screen.getByRole("alert")).toHaveTextContent(/no autorizado/i);
    expect(screen.queryByTestId("roles-panel")).not.toBeInTheDocument();
  });
});
