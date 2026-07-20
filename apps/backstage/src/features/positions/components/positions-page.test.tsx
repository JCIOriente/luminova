import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import type { AuthClaims } from "@luminova/auth/roles";

vi.mock("../hooks/use-positions", () => ({
  usePositions: () => ({ data: [], isLoading: false, isError: false }),
}));
vi.mock("../hooks/use-add-position", () => ({
  useAddPosition: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock("../hooks/use-update-position", () => ({
  useUpdatePosition: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock("../hooks/use-delete-position", () => ({
  useDeletePosition: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock("../hooks/use-seed-positions", () => ({
  useSeedPositions: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

import { PositionsPage } from "./positions-page";
import { AbilityProvider } from "../../../lib/authz/ability-context";

function renderWith(claims: AuthClaims, ui: ReactElement) {
  return render(
    <AbilityProvider claims={claims} uid="u">
      {ui}
    </AbilityProvider>,
  );
}

describe("PositionsPage — create gate", () => {
  it("shows the Nuevo cargo action to a principal with create:Position", () => {
    renderWith({ roles: ["Member"], perms: ["create:Position"] }, <PositionsPage />);
    expect(screen.getByRole("button", { name: /nuevo cargo/i })).toBeInTheDocument();
  });

  it("hides the Nuevo cargo action from a principal without create:Position", () => {
    renderWith({ roles: ["Member"] }, <PositionsPage />);
    expect(screen.queryByRole("button", { name: /nuevo cargo/i })).not.toBeInTheDocument();
  });
});
