import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import type { AuthClaims } from "@luminova/auth/roles";

vi.mock("../hooks/use-initiatives-by-term", () => ({
  useInitiativesByTerm: () => ({ data: [], isLoading: false, isError: false }),
}));
vi.mock("../../activities/hooks/use-activities-by-term", () => ({
  useActivitiesByTerm: () => ({ data: [] }),
}));
vi.mock("../../members/hooks/use-members", () => ({ useMembers: () => ({ data: [] }) }));
vi.mock("../hooks/use-create-initiative", () => ({
  useCreateInitiative: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock("@tanstack/react-router", async (orig) => ({
  ...(await orig<typeof import("@tanstack/react-router")>()),
  useNavigate: () => vi.fn(),
}));

import { InitiativesPage } from "./initiatives-page";
import { AbilityProvider } from "../../../lib/authz/ability-context";

function renderWith(claims: AuthClaims, ui: ReactElement) {
  return render(
    <AbilityProvider claims={claims} uid="u">
      {ui}
    </AbilityProvider>,
  );
}

describe("InitiativesPage — create gate", () => {
  it("shows Nuevo to a principal who can create a Project", () => {
    renderWith({ roles: ["Member"], perms: ["create:Project"] }, <InitiativesPage />);
    expect(screen.getByRole("button", { name: /^nuevo$/i })).toBeInTheDocument();
  });

  it("hides Nuevo from a principal who can create neither Program nor Project", () => {
    renderWith({ roles: ["Member"] }, <InitiativesPage />);
    expect(screen.queryByRole("button", { name: /^nuevo$/i })).not.toBeInTheDocument();
  });
});
