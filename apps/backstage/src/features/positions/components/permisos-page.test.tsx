import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import type { ReactElement, ReactNode } from "react";
import type { AuthClaims } from "@luminova/auth/roles";
import { ROLES } from "@luminova/types";

interface QueryStub {
  data: unknown[];
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  refetch: () => void;
}

// One stub per hook, not one shared literal: the page owns three queries and the whole
// point of the merge is that they collapse into ONE loading state and ONE error block.
const stubs = vi.hoisted(() => {
  const idle = (): QueryStub => ({
    data: [],
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  });
  return { positions: idle(), members: idle(), roles: idle(), idle };
});

vi.mock("../hooks/use-positions", () => ({ usePositions: () => stubs.positions }));
vi.mock("../../members/hooks/use-members", () => ({ useMembers: () => stubs.members }));
vi.mock("../../permissions/hooks/use-roles", () => ({ useRoles: () => stubs.roles }));
vi.mock("../../permissions/hooks/use-save-role", () => ({
  useAddRole: () => ({ mutateAsync: vi.fn() }),
  useUpdateRole: () => ({ mutateAsync: vi.fn() }),
  useDeleteRole: () => ({ mutateAsync: vi.fn() }),
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

const admin: AuthClaims = { roles: ["Admin"], perms: ["manage:all"] };

beforeEach(() => {
  stubs.positions = stubs.idle();
  stubs.members = stubs.idle();
  stubs.roles = stubs.idle();
});

describe("PermisosPage — Admin-role gate", () => {
  it("renders the single roles panel for an Admin", () => {
    renderWith(admin, <PermisosPage />);
    expect(screen.getByRole("heading", { name: /permisos/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Roles" })).toBeInTheDocument();
  });

  it("blocks a non-Admin (even with manage:all perm) with No autorizado", () => {
    renderWith({ roles: ["Member"], perms: ["manage:all"] }, <PermisosPage />);
    expect(screen.getByRole("alert")).toHaveTextContent(/no autorizado/i);
    expect(screen.queryByRole("heading", { name: "Roles" })).not.toBeInTheDocument();
  });
});

// Each hook is pinned INDEPENDENTLY. Unioned with `||`, dropping any one term still leaves
// the other two driving both branches, so a suite that only ever fails `roles` stays green
// while a positions outage renders every row as "Ningún cargo lo otorga" — a wrong
// authorization picture presented as fact, with no error block.
const QUERIES = ["positions", "members", "roles"] as const;

describe.each(QUERIES)("PermisosPage — the %s query alone drives both branches", (key) => {
  it("puts the page in its single loading state", () => {
    stubs[key] = { ...stubs.idle(), isLoading: true };
    const { container } = renderWith(admin, <PermisosPage />);
    expect(container.querySelectorAll(".animate-skeleton").length).toBeGreaterThan(0);
    expect(screen.queryByRole("heading", { name: "Roles" })).not.toBeInTheDocument();
    expect(screen.queryByText("No se pudo cargar")).not.toBeInTheDocument();
  });

  it("puts the page in its single error state, surfacing that query's error", () => {
    stubs[key] = { ...stubs.idle(), isError: true, error: new Error(`${key} boom`) };
    const { container } = renderWith(admin, <PermisosPage />);
    expect(screen.getAllByText("No se pudo cargar")).toHaveLength(1);
    expect(screen.queryByRole("heading", { name: "Roles" })).not.toBeInTheDocument();
    expect(container.querySelectorAll(".animate-skeleton")).toHaveLength(0);
  });

  it("lets the error branch win over a still-loading sibling", () => {
    // isError is checked before isLoading: a partial outage must not paint a skeleton
    // forever while one query retries.
    stubs[key] = { ...stubs.idle(), isError: true, error: new Error(`${key} boom`) };
    for (const other of QUERIES) {
      if (other !== key) stubs[other] = { ...stubs.idle(), isLoading: true };
    }
    const { container } = renderWith(admin, <PermisosPage />);
    expect(screen.getAllByText("No se pudo cargar")).toHaveLength(1);
    expect(container.querySelectorAll(".animate-skeleton")).toHaveLength(0);
  });
});

describe("PermisosPage — query states", () => {
  it("renders exactly one error block when several queries fail", () => {
    // RoleManager used to run its own useRoles with its own branches, so one outage
    // painted two error blocks on the same screen.
    stubs.roles = { ...stubs.idle(), isError: true, error: new Error("boom") };
    stubs.members = { ...stubs.idle(), isError: true, error: new Error("boom") };
    const { container } = renderWith(admin, <PermisosPage />);
    expect(screen.getAllByText("No se pudo cargar")).toHaveLength(1);
    expect(screen.queryByRole("heading", { name: "Roles" })).not.toBeInTheDocument();
    expect(container.querySelectorAll(".animate-skeleton")).toHaveLength(0);
  });

  it("refetches all three queries from the single retry button", async () => {
    stubs.roles = { ...stubs.idle(), isError: true, error: new Error("boom") };
    renderWith(admin, <PermisosPage />);
    screen.getByRole("button", { name: "Reintentar" }).click();
    expect(stubs.positions.refetch).toHaveBeenCalledTimes(1);
    expect(stubs.members.refetch).toHaveBeenCalledTimes(1);
    expect(stubs.roles.refetch).toHaveBeenCalledTimes(1);
  });

  it("renders every built-in role as unsynced when nothing is seeded yet", () => {
    // The real pre-seed condition. A blank "no roles configured" page would hide that
    // these roles are already grantable by a cargo and already mint perms via beacon's
    // BUILT_IN_ROLE_PERMS fallback.
    renderWith(admin, <PermisosPage />);
    expect(screen.getAllByText("Sin sincronizar")).toHaveLength(ROLES.length);
    expect(screen.getByText("Administrador")).toBeInTheDocument();
  });
});
