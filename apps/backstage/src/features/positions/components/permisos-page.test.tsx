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
  useReactivateRole: () => ({ mutateAsync: vi.fn() }),
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

// REVERSES the previous union-gating suite (`describe.each(QUERIES)`), which pinned
// positions/members/roles as EACH driving both page branches. That was correct while the
// page's only alternative was rendering "Ningún cargo lo otorga" / "Nadie aún" for a
// failed query — a wrong authorization picture presented as fact. It is wrong now: the
// only affordance that can RESTORE a deactivated role lives in RolesPanel, and gating it
// on an unrelated members read makes a deactivated role permanently unrestorable in the
// UI. The panel now labels each degraded section explicitly instead, so nothing empty is
// ever presented as authoritative.
describe("PermisosPage — the roles query alone gates the panel", () => {
  it("puts the page in its loading state while roles loads", () => {
    stubs.roles = { ...stubs.idle(), isLoading: true };
    const { container } = renderWith(admin, <PermisosPage />);
    expect(container.querySelectorAll(".animate-skeleton").length).toBeGreaterThan(0);
    expect(screen.queryByRole("heading", { name: "Roles" })).not.toBeInTheDocument();
  });

  it("puts the page in its error state when roles fails", () => {
    stubs.roles = { ...stubs.idle(), isError: true, error: new Error("roles boom") };
    const { container } = renderWith(admin, <PermisosPage />);
    expect(screen.getAllByText("No se pudo cargar")).toHaveLength(1);
    expect(screen.queryByRole("heading", { name: "Roles" })).not.toBeInTheDocument();
    expect(container.querySelectorAll(".animate-skeleton")).toHaveLength(0);
  });

  it("lets the roles error win over a still-loading roles retry", () => {
    stubs.roles = { ...stubs.idle(), isError: true, isLoading: true, error: new Error("boom") };
    const { container } = renderWith(admin, <PermisosPage />);
    expect(screen.getAllByText("No se pudo cargar")).toHaveLength(1);
    expect(container.querySelectorAll(".animate-skeleton")).toHaveLength(0);
  });
});

describe.each(["positions", "members"] as const)(
  "PermisosPage — a %s outage degrades one section, never the page",
  (key) => {
    it("still renders the roles panel (the only restore affordance)", () => {
      stubs[key] = { ...stubs.idle(), isError: true, error: new Error(`${key} boom`) };
      renderWith(admin, <PermisosPage />);
      expect(screen.getByRole("heading", { name: "Roles" })).toBeInTheDocument();
      expect(screen.queryByText("No se pudo cargar")).not.toBeInTheDocument();
    });

    it("labels its own section 'No disponible' instead of an empty state", () => {
      stubs[key] = { ...stubs.idle(), isError: true, error: new Error(`${key} boom`) };
      renderWith(admin, <PermisosPage />);
      expect(screen.getAllByText("No disponible").length).toBeGreaterThan(0);
    });

    it("labels its own section 'Cargando…' while it loads", () => {
      stubs[key] = { ...stubs.idle(), isLoading: true };
      renderWith(admin, <PermisosPage />);
      expect(screen.getByRole("heading", { name: "Roles" })).toBeInTheDocument();
      expect(screen.getAllByText("Cargando…").length).toBeGreaterThan(0);
    });
  },
);

describe("PermisosPage — query states", () => {
  it("BLOCKING: renders the panel even when BOTH side queries fail", () => {
    // The regression this replaces: one bad members read made a deactivated role
    // permanently unrestorable.
    stubs.positions = { ...stubs.idle(), isError: true, error: new Error("boom") };
    stubs.members = { ...stubs.idle(), isError: true, error: new Error("boom") };
    renderWith(admin, <PermisosPage />);
    expect(screen.getByRole("heading", { name: "Roles" })).toBeInTheDocument();
    expect(screen.queryByText("No se pudo cargar")).not.toBeInTheDocument();
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
