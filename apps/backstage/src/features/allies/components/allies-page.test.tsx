import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import type { AuthClaims } from "@luminova/auth/roles";

vi.mock("../hooks/use-allies", () => ({
  useAllies: () => ({ data: [], isLoading: false, isError: false }),
}));
vi.mock("../hooks/use-add-ally", () => ({ useAddAlly: () => ({ mutateAsync: vi.fn() }) }));
vi.mock("../hooks/use-update-ally", () => ({ useUpdateAlly: () => ({ mutateAsync: vi.fn() }) }));
vi.mock("../hooks/use-delete-ally", () => ({ useDeleteAlly: () => ({ mutateAsync: vi.fn() }) }));
vi.mock("../hooks/use-set-ally-logo", () => ({ useSetAllyLogo: () => ({ mutateAsync: vi.fn() }) }));
vi.mock("../hooks/use-remove-ally-logo", () => ({
  useRemoveAllyLogo: () => ({ mutateAsync: vi.fn() }),
}));

import { AlliesPage } from "./allies-page";
import { AbilityProvider } from "../../../lib/authz/ability-context";

function renderWith(claims: AuthClaims, ui: ReactElement) {
  return render(
    <AbilityProvider claims={claims} uid="u">
      {ui}
    </AbilityProvider>,
  );
}

describe("AlliesPage — create gate", () => {
  it("shows Agregar aliado to a principal with create:Ally", () => {
    renderWith({ roles: ["Member"], perms: ["create:Ally"] }, <AlliesPage />);
    expect(screen.getByRole("button", { name: /agregar aliado/i })).toBeInTheDocument();
  });

  it("hides Agregar aliado from a principal without create:Ally", () => {
    renderWith({ roles: ["Member"] }, <AlliesPage />);
    expect(screen.queryByRole("button", { name: /agregar aliado/i })).not.toBeInTheDocument();
  });
});
