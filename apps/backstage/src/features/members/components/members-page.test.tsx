import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import type { AuthClaims } from "@luminova/auth/roles";

vi.mock("../hooks/use-members", () => ({
  useMembers: () => ({ data: [], isLoading: false, isError: false }),
}));
vi.mock("../../positions/hooks/use-positions", () => ({ usePositions: () => ({ data: [] }) }));
vi.mock("../hooks/use-add-member", () => ({ useAddMember: () => ({ mutateAsync: vi.fn() }) }));
vi.mock("../hooks/use-update-member", () => ({
  useUpdateMember: () => ({ mutateAsync: vi.fn() }),
}));
vi.mock("../hooks/use-set-member-status", () => ({
  useSetMemberStatus: () => ({ mutate: vi.fn() }),
}));
vi.mock("../hooks/use-unpublish-member", () => ({
  useUnpublishMember: () => ({ mutate: vi.fn() }),
}));
vi.mock("../hooks/use-provision-member-login", () => ({
  useProvisionMemberLogin: () => ({ mutateAsync: vi.fn(), mutate: vi.fn(), isPending: false }),
}));
// MemberDrawer (rendered from this page) now reads the caller's uid to decide whether the row
// it opened is the caller's OWN — the table lists it too, so that edit is a SELF-assignment.
// Mocked as a factory with no `importOriginal`: lib/auth/auth builds its store from
// getFirebase().auth at module scope, so evaluating the real module initializes Firebase and
// the whole file fails to collect.
vi.mock("../../../lib/auth/auth", () => ({
  useAuth: () => ({ user: { uid: "u" }, claims: { roles: ["Admin"] } }),
}));

import { MembersPage } from "./members-page";
import { AbilityProvider } from "../../../lib/authz/ability-context";

function renderWith(claims: AuthClaims, ui: ReactElement) {
  return render(
    <AbilityProvider claims={claims} uid="u">
      {ui}
    </AbilityProvider>,
  );
}

describe("MembersPage — action gates", () => {
  it("shows Invitar miembro + Exportar to a principal with manage:Member", () => {
    renderWith({ roles: ["Member"], perms: ["manage:Member"] }, <MembersPage />);
    expect(screen.getByRole("button", { name: /invitar miembro/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /exportar/i })).toBeInTheDocument();
  });

  it("hides both actions from a principal without Member management perms", () => {
    renderWith({ roles: ["Member"] }, <MembersPage />);
    expect(screen.queryByRole("button", { name: /invitar miembro/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /exportar/i })).not.toBeInTheDocument();
  });
});
