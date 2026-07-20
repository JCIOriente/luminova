import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import type { AuthClaims } from "@luminova/auth/roles";

vi.mock("../hooks/use-leads", () => ({
  useLeads: () => ({ data: [], isLoading: false, isError: false, error: null, refetch: vi.fn() }),
}));
vi.mock("../hooks/use-update-lead-status", () => ({
  useUpdateLeadStatus: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("../hooks/use-delete-lead", () => ({
  useDeleteLead: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

import { LeadsPage } from "./leads-page";
import { AbilityProvider } from "../../../lib/authz/ability-context";

function renderWith(claims: AuthClaims, ui: ReactElement) {
  return render(
    <AbilityProvider claims={claims} uid="u">
      {ui}
    </AbilityProvider>,
  );
}

describe("LeadsPage — read gate", () => {
  it("fences out a principal without read:Lead", () => {
    renderWith({ roles: ["Member"] }, <LeadsPage />);
    expect(screen.getByText(/acceso restringido/i)).toBeInTheDocument();
    expect(screen.queryByText(/^Prospectos$/)).not.toBeInTheDocument();
  });

  it("renders the inbox for a principal with read:Lead", () => {
    renderWith({ roles: ["Member"], perms: ["read:Lead"] }, <LeadsPage />);
    expect(screen.queryByText(/acceso restringido/i)).not.toBeInTheDocument();
    expect(screen.getByText(/personas que nos escribieron/i)).toBeInTheDocument();
  });
});
