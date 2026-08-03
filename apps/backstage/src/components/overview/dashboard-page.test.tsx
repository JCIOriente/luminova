import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { AuthClaims } from "@luminova/auth/roles";
import { roleClaims } from "@luminova/auth/test-helpers";

const membersQuery = vi.fn();
const alliesQuery = vi.fn();

vi.mock("../../lib/auth/auth", () => ({
  useAuth: () => ({ user: { email: "a@b.co" }, claims: { roles: ["Secretary"] } }),
}));
vi.mock("../../features/members/hooks/use-members", () => ({
  useMembers: (options?: { enabled?: boolean }) => {
    membersQuery(options);
    // The real repository call a Secretary is denied: rules reject the unconditional
    // members list without read:Member, so the query settles as an error.
    return options?.enabled === false
      ? { data: undefined, isError: false }
      : { data: undefined, isError: true };
  },
}));
vi.mock("../../features/allies/hooks/use-allies", () => ({
  useAllies: (options?: { enabled?: boolean }) => {
    alliesQuery(options);
    return { data: [], isError: false };
  },
}));
vi.mock("../../features/activities/hooks/use-activities-by-term", () => ({
  useActivitiesByTerm: () => ({ data: [], isError: false }),
}));
vi.mock("../../features/members/hooks/use-member-points-by-term", () => ({
  useMemberPointsByTerm: () => ({ data: [], isError: false }),
}));
vi.mock("../../features/initiatives/hooks/use-initiatives-by-term", () => ({
  useInitiativesByTerm: () => ({ data: [], isError: false }),
}));

import { DashboardPage } from "./dashboard-page";
import { AbilityProvider } from "../../lib/authz/ability-context";

const ERROR_TEXT = /no se pudo cargar el panel/i;

function renderWith(claims: AuthClaims) {
  return render(
    <AbilityProvider claims={claims} uid="u">
      <DashboardPage />
    </AbilityProvider>,
  );
}

describe("DashboardPage — capability-gated queries", () => {
  it("BLOCKING: a Secretary-only user renders the panel instead of the load-error card", () => {
    // Secretary holds no read:Member. Before the gate, useMembers fired unconditionally,
    // the rules denied the list, and the whole page painted "No se pudo cargar el panel."
    // — the exhaustive board-home layout never got a chance to matter. ProjectManager and
    // ActivityManager were in the same position.
    renderWith(roleClaims("Secretary"));
    expect(screen.queryByText(ERROR_TEXT)).not.toBeInTheDocument();
    expect(membersQuery).toHaveBeenCalledWith(expect.objectContaining({ enabled: false }));
  });

  it("still runs the members query for a principal holding read:Member", () => {
    membersQuery.mockClear();
    renderWith(roleClaims("Treasury"));
    expect(membersQuery).toHaveBeenCalledWith(expect.objectContaining({ enabled: true }));
  });

  it("gates the allies query on read:Ally too (ActivityManager holds neither)", () => {
    alliesQuery.mockClear();
    renderWith(roleClaims("ActivityManager"));
    expect(alliesQuery).toHaveBeenCalledWith(expect.objectContaining({ enabled: false }));
  });
});
