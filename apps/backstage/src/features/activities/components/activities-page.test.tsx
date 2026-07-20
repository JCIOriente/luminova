import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";
import type { AuthClaims } from "@luminova/auth/roles";

const emptyList = { data: [], isLoading: false, isError: false };
vi.mock("../hooks/use-activities-by-term", () => ({ useActivitiesByTerm: () => emptyList }));
vi.mock("../../members/hooks/use-members", () => ({ useMembers: () => ({ data: [] }) }));
vi.mock("../../initiatives/hooks/use-initiatives-of-type", () => ({
  useInitiativesOfType: () => ({ data: [] }),
}));
vi.mock("../hooks/use-create-activity", () => ({
  useCreateActivity: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock("../hooks/use-update-activity", () => ({
  useUpdateActivity: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock("../hooks/use-cancel-activity", () => ({
  useCancelActivity: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock("../../../lib/auth/auth", () => ({
  useAuth: () => ({ claims: { roles: [] }, user: null }),
}));

import { ActivitiesPage } from "./activities-page";
import { AbilityProvider } from "../../../lib/authz/ability-context";

function renderWith(claims: AuthClaims, ui: ReactElement) {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <AbilityProvider claims={claims} uid="u">
        {ui}
      </AbilityProvider>
    </QueryClientProvider>,
  );
}

describe("ActivitiesPage — create gate", () => {
  it("shows Nueva actividad to a principal with create:Activity", () => {
    renderWith({ roles: ["Member"], perms: ["create:Activity"] }, <ActivitiesPage />);
    expect(screen.getByRole("button", { name: /nueva actividad/i })).toBeInTheDocument();
  });

  it("hides Nueva actividad from a principal without create:Activity", () => {
    renderWith({ roles: ["Member"] }, <ActivitiesPage />);
    expect(screen.queryByRole("button", { name: /nueva actividad/i })).not.toBeInTheDocument();
  });
});
