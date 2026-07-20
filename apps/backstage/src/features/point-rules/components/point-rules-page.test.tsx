import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import type { AuthClaims } from "@luminova/auth/roles";

vi.mock("../hooks/use-point-rules", () => ({
  usePointRules: () => ({ data: [], isLoading: false, isError: false }),
}));
vi.mock("../hooks/use-seed-point-rules", () => ({
  useSeedPointRules: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("../hooks/use-update-point-rule", () => ({
  useUpdatePointRule: () => ({ mutate: vi.fn(), isPending: false }),
}));

import { PointRulesPage } from "./point-rules-page";
import { AbilityProvider } from "../../../lib/authz/ability-context";

function renderWith(claims: AuthClaims, ui: ReactElement) {
  return render(
    <AbilityProvider claims={claims} uid="u">
      {ui}
    </AbilityProvider>,
  );
}

describe("PointRulesPage — seed gate (Admin role, not create:PointRule perm)", () => {
  it("shows Inicializar to an Admin when the matrix is empty", () => {
    renderWith({ roles: ["Admin"], perms: ["manage:all"] }, <PointRulesPage />);
    expect(screen.getByRole("button", { name: /inicializar/i })).toBeInTheDocument();
  });

  it("hides Inicializar from a non-Admin even with a create:PointRule perm", () => {
    renderWith({ roles: ["Member"], perms: ["create:PointRule"] }, <PointRulesPage />);
    expect(screen.queryByRole("button", { name: /inicializar/i })).not.toBeInTheDocument();
  });
});
