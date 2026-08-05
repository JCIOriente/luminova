import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { AuthClaims } from "@luminova/auth/roles";
import { roleClaims } from "@luminova/auth/test-helpers";

const membersQuery = vi.fn();
const alliesQuery = vi.fn();

// The claims BOTH the ability and the board-home layout read. Hard-coding one role here
// would silently pin every case to that role's widget set — a KPI assertion under a layout
// with no `kpis` widget passes for the wrong reason.
let currentClaims: AuthClaims = roleClaims("Secretary");
// What the members query settles to when it IS enabled. Default: the denial a principal
// without read:Member would actually get.
let membersWhenEnabled: { data: unknown[] | undefined; isError: boolean } = {
  data: undefined,
  isError: true,
};

vi.mock("../../lib/auth/auth", () => ({
  useAuth: () => ({ user: { email: "a@b.co" }, claims: currentClaims }),
}));
vi.mock("../../features/members/hooks/use-members", () => ({
  useMembers: (options?: { enabled?: boolean }) => {
    membersQuery(options);
    // A disabled query never resolves — data stays undefined and isError stays false.
    return options?.enabled === false ? { data: undefined, isError: false } : membersWhenEnabled;
  },
}));
vi.mock("../../features/allies/hooks/use-allies", () => ({
  useAllies: (options?: { enabled?: boolean }) => {
    alliesQuery(options);
    return options?.enabled === false
      ? { data: undefined, isError: false }
      : { data: [], isError: false };
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
  currentClaims = claims;
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

describe("DashboardPage — a gated-away query must not become a zero", () => {
  afterEach(() => {
    membersWhenEnabled = { data: undefined, isError: true };
  });

  it("BLOCKING: a Treasury principal gets NO Aliados tile, not one reading 0", () => {
    // Treasury's layout contains `kpis` but Treasury holds no read:Ally, so the allies
    // query is disabled and never resolves. Substituting [] made the tile render "Aliados
    // 0" for a chapter with 14 — a fabricated fact with no error and no skeleton to hint
    // at it (guardrail #3). The tile is omitted instead.
    membersWhenEnabled = { data: [], isError: false };
    renderWith(roleClaims("Treasury"));
    expect(screen.queryByText("Aliados")).not.toBeInTheDocument();
    // The KPI row DID render — otherwise the assertion above would pass for the wrong reason.
    expect(screen.getByText("Miembros activos")).toBeInTheDocument();
  });
});
