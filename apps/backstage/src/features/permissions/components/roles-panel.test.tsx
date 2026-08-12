import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { RoleDefinition } from "@luminova/types";
import type { RoleOverviewRow } from "../lib/role-overview";

const addMutate = vi.fn().mockResolvedValue("new-id");
const updateMutate = vi.fn().mockResolvedValue(undefined);
const deleteMutate = vi.fn().mockResolvedValue(undefined);
const reactivateMutate = vi.fn().mockResolvedValue(undefined);
vi.mock("../hooks/use-save-role", () => ({
  useAddRole: () => ({ mutateAsync: addMutate }),
  useUpdateRole: () => ({ mutateAsync: updateMutate }),
  useDeleteRole: () => ({ mutateAsync: deleteMutate }),
  useReactivateRole: () => ({ mutateAsync: reactivateMutate }),
}));

import { RolesPanel } from "./roles-panel";

// Drifted off ROLE_LABELS.Admin / ROLE_DESCRIPTIONS.Admin on purpose: byte-identical
// fixtures would pass even if the panel ignored its props and rendered the snapshot.
const adminDoc: RoleDefinition = {
  id: "Admin",
  name: "Administración General",
  description: "Manda en todo.",
  builtIn: true,
  builtInKey: "Admin",
  permissions: ["manage:all"],
  locked: true,
  active: true,
  deletedAt: null,
};

const customDoc: RoleDefinition = {
  id: "custom-1",
  name: "Auditoría",
  description: "Revisa las cuentas.",
  builtIn: false,
  builtInKey: null,
  permissions: [],
  locked: false,
  active: true,
  deletedAt: null,
};

const unsyncedRow: RoleOverviewRow = {
  role: null,
  id: "ProjectManager",
  builtInKey: "ProjectManager",
  label: "Proyectos",
  description: "Gestionar proyectos.",
  permissions: ["manage:Project"],
  active: true,
  grantingCargos: [],
  holders: [],
};

// Structural stand-in for a firebase Timestamp — the panel only tests null-ness, and the
// real class would drag the firestore SDK into a component test.
const DELETED_AT = { seconds: 1, nanoseconds: 0 } as unknown as RoleDefinition["deletedAt"];

function rowFor(doc: RoleDefinition, over: Partial<RoleOverviewRow> = {}): RoleOverviewRow {
  return {
    role: doc,
    id: doc.id,
    builtInKey: doc.builtInKey,
    label: doc.name,
    description: doc.description,
    permissions: doc.permissions,
    active: doc.active && doc.deletedAt === null,
    grantingCargos: [],
    holders: [],
    ...over,
  };
}

beforeEach(() => {
  addMutate.mockClear();
  updateMutate.mockClear();
  deleteMutate.mockClear();
  reactivateMutate.mockClear();
});

describe("RolesPanel", () => {
  it("renders one row per role with its cargos and holders", () => {
    render(
      <RolesPanel
        rows={[
          rowFor(adminDoc, {
            grantingCargos: ["Presidente"],
            holders: [{ id: "m0", name: "Olivia" }],
          }),
        ]}
      />,
    );
    expect(screen.getByText("Administración General")).toBeInTheDocument();
    expect(screen.getByText("Manda en todo.")).toBeInTheDocument();
    expect(screen.getByText(/Presidente/)).toBeInTheDocument();
    expect(screen.getByText(/Olivia/)).toBeInTheDocument();
  });

  it("renders the row's resolved description, not the doc's blank one", () => {
    // Production built-in docs carry description: "". buildRoleOverview resolves that to
    // the snapshot text; the panel must render what it was handed, not re-read the doc.
    const blank = { ...adminDoc, description: "" };
    render(<RolesPanel rows={[rowFor(blank, { description: "Acceso total a la plataforma." })]} />);
    expect(screen.getByText("Acceso total a la plataforma.")).toBeInTheDocument();
  });

  it("labels a custom role's origin as direct assignment", () => {
    // "Otorgado por: <cargo>" is structurally impossible for a custom role.
    render(<RolesPanel rows={[rowFor(customDoc)]} />);
    expect(screen.getByText(/Asignación directa/)).toBeInTheDocument();
  });

  it("truncates a long holder list", () => {
    // The Miembro row lists the whole chapter; 7 holders must render 5 names + "y 2 más".
    const holders = Array.from({ length: 7 }, (_, i) => ({ id: `m${i}`, name: `Socio${i}` }));
    render(<RolesPanel rows={[rowFor(adminDoc, { holders })]} />);
    expect(screen.getByText(/y 2 más/)).toBeInTheDocument();
    expect(screen.queryByText(/Socio5/)).not.toBeInTheDocument();
  });

  it("marks a built-in role that has no seeded doc and offers no editor for it", () => {
    render(<RolesPanel rows={[unsyncedRow]} />);
    expect(screen.getByText("Sin sincronizar")).toBeInTheDocument();
    expect(screen.getByText("Proyectos")).toBeInTheDocument();
    // No doc to write to — updateRole on a missing doc would fail.
    expect(screen.queryByRole("button", { name: /editar|ver/i })).not.toBeInTheDocument();
  });

  // The badge reads builtInKey, NOT doc.builtIn: an unsynced built-in has no doc at all, so
  // a doc-derived predicate labels a live power grant "Personalizado" — the opposite of the
  // truth on the page whose job is "who can do what".
  it.each([
    ["a seeded built-in", () => rowFor(adminDoc), "Predefinido", "Personalizado"],
    ["an unsynced built-in", () => unsyncedRow, "Predefinido", "Personalizado"],
    ["a custom role", () => rowFor(customDoc), "Personalizado", "Predefinido"],
  ])("badges %s as %s", (_name, row, expected, absent) => {
    render(<RolesPanel rows={[row()]} />);
    expect(screen.getByText(expected)).toBeInTheDocument();
    expect(screen.queryByText(absent)).not.toBeInTheDocument();
  });

  it("keys rows so an unsynced built-in and a custom doc of the same id do not collide", () => {
    // role-overview emits the unsynced row keyed by its ROLES key, so a custom doc whose id
    // spells an unseeded key produces two rows sharing `row.id`.
    const collidingCustom = { ...customDoc, id: "ProjectManager", name: "Proyectos (viejo)" };
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    render(<RolesPanel rows={[unsyncedRow, rowFor(collidingCustom)]} />);
    expect(screen.getByText("Proyectos")).toBeInTheDocument();
    expect(screen.getByText("Proyectos (viejo)")).toBeInTheDocument();
    expect(consoleError).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it("offers the editor for a seeded role", () => {
    render(<RolesPanel rows={[rowFor(customDoc)]} />);
    expect(screen.getByRole("button", { name: "Editar" })).toBeInTheDocument();
    expect(screen.queryByText("Sin sincronizar")).not.toBeInTheDocument();
  });

  it("BLOCKING: a deactivated row shows its STORED perm count plus the reactivation promise", () => {
    const dead = {
      ...customDoc,
      active: false,
      permissions: ["manage:Ally", "read:Position"] as RoleDefinition["permissions"],
    };
    render(<RolesPanel rows={[rowFor(dead)]} />);
    expect(screen.getByText("Desactivado")).toBeInTheDocument();
    expect(
      screen.getByText(/2 permisos · inactivo — se otorgarán al reactivar/),
    ).toBeInTheDocument();
  });

  it("does not badge or annotate an active row", () => {
    render(<RolesPanel rows={[rowFor(customDoc)]} />);
    expect(screen.queryByText("Desactivado")).not.toBeInTheDocument();
    expect(screen.queryByText(/se otorgarán al reactivar/)).not.toBeInTheDocument();
  });

  it("BLOCKING: an inactive BUILT-IN row says name-keyed authority survived the deactivation", () => {
    // computeMemberRoles is pure over positions.grants and reads no role doc, so the
    // `roles` claim keeps a deactivated built-in's NAME: canCurateFeatured(), the Scanner
    // conjunct, the /positions nav allowlist and the board layout all still fire. The row
    // must not read as a total revocation.
    render(<RolesPanel rows={[rowFor({ ...adminDoc, locked: false, active: false })]} />);
    expect(screen.getByText(/accesos ligados al nombre del rol/i)).toBeInTheDocument();
    expect(screen.getByText(/cargos que lo otorgan/i)).toBeInTheDocument();
  });

  it("omits the name-keyed clause for a CUSTOM role (its name never reaches the claim)", () => {
    // computeMemberRoles filters through ROLES, so a custom role's name is unrepresentable
    // in the claim — there is no name-keyed authority to survive.
    render(<RolesPanel rows={[rowFor({ ...customDoc, active: false })]} />);
    expect(screen.queryByText(/accesos ligados al nombre del rol/i)).not.toBeInTheDocument();
  });

  it("omits the name-keyed clause on an ACTIVE built-in row", () => {
    render(<RolesPanel rows={[rowFor(adminDoc)]} />);
    expect(screen.queryByText(/accesos ligados al nombre del rol/i)).not.toBeInTheDocument();
  });

  it("labels the holder list 'Miembros activos' (not the complete blast radius)", () => {
    // useMembers() filters where('active','==',true) while the onRoleWritten fan-out has
    // no active filter (index.ts:298), so soft-deleted members with a surviving Auth user
    // DO receive the perms. The count must not be presented as complete.
    render(<RolesPanel rows={[rowFor(customDoc, { holders: [{ id: "m0", name: "Olivia" }] })]} />);
    expect(screen.getByText("Miembros activos:")).toBeInTheDocument();
  });
});

describe("RolesPanel reactivation", () => {
  const dead = {
    ...customDoc,
    active: false,
    permissions: ["manage:Ally", "read:Position"] as RoleDefinition["permissions"],
  };

  it("offers Reactivar rol only on a deactivated row", () => {
    render(<RolesPanel rows={[rowFor(dead), rowFor(customDoc)]} />);
    expect(screen.getAllByRole("button", { name: "Reactivar rol" })).toHaveLength(1);
  });

  it("offers no Reactivar rol for an unsynced built-in (no doc to write to)", () => {
    render(<RolesPanel rows={[unsyncedRow]} />);
    expect(screen.queryByRole("button", { name: "Reactivar rol" })).not.toBeInTheDocument();
  });

  it("BLOCKING: the confirmation states the perms set and the holder count before writing", async () => {
    // Reactivation mints this exact set to every holder at once, through an unbounded
    // no-retry members scan. The admin must see WHAT and to WHOM before confirming.
    const user = userEvent.setup();
    render(<RolesPanel rows={[rowFor(dead, { holders: [{ id: "m0", name: "Olivia" }] })]} />);

    await user.click(screen.getByRole("button", { name: "Reactivar rol" }));

    expect(screen.getByText(/1 miembro activo/)).toBeInTheDocument();
    expect(screen.getByText("Gestionar Aliados")).toBeInTheDocument();
    expect(screen.getByText("Ver Cargos")).toBeInTheDocument();
    expect(reactivateMutate).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Reactivar" }));
    expect(reactivateMutate).toHaveBeenCalledWith("custom-1");
  });

  it("Cancelar closes the confirmation without writing", async () => {
    const user = userEvent.setup();
    render(<RolesPanel rows={[rowFor(dead)]} />);
    await user.click(screen.getByRole("button", { name: "Reactivar rol" }));
    await user.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(reactivateMutate).not.toHaveBeenCalled();
  });

  it("BLOCKING: offers no Reactivar rol on the locked doc — rules deny every update to it", () => {
    // firestore.rules:441-442 requires `locked == false` for ANY roles update, so the
    // write is denied before it reaches roleLifecycleSafe(). Prod role docs are known to
    // lag the seed, and a console write can leave roles/Admin inactive: the affordance
    // would appear and 403.
    render(<RolesPanel rows={[rowFor({ ...adminDoc, active: false })]} />);
    expect(screen.queryByRole("button", { name: "Reactivar rol" })).not.toBeInTheDocument();
    expect(screen.getByText(/consola de Firebase/i)).toBeInTheDocument();
  });

  it("BLOCKING: surfaces a rejected reactivation and keeps the confirmation open", async () => {
    // Nothing catches a rejected mutation globally — query-client.ts wires QueryCache only,
    // with no MutationCache.onError, and useReactivateRole sets no onError. Without a local
    // catch this is an unhandled promise rejection: no message, dialog stuck open.
    const user = userEvent.setup();
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    reactivateMutate.mockRejectedValueOnce(new Error("permission-denied"));
    render(<RolesPanel rows={[rowFor(dead)]} />);

    await user.click(screen.getByRole("button", { name: "Reactivar rol" }));
    await user.click(screen.getByRole("button", { name: "Reactivar" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("No se pudo reactivar el rol.");
    expect(screen.getByRole("button", { name: "Reactivar" })).toBeInTheDocument();
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it("clears a stale reactivation error when the confirmation is reopened", async () => {
    const user = userEvent.setup();
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    reactivateMutate.mockRejectedValueOnce(new Error("permission-denied"));
    render(<RolesPanel rows={[rowFor(dead)]} />);

    await user.click(screen.getByRole("button", { name: "Reactivar rol" }));
    await user.click(screen.getByRole("button", { name: "Reactivar" }));
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Cancelar" }));
    await user.click(screen.getByRole("button", { name: "Reactivar rol" }));

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    consoleError.mockRestore();
  });

  it.each([["loading"], ["error"]] as const)(
    "BLOCKING: does not assert a holder count in the confirmation while holders are %s",
    async (state) => {
      // permisos-page keeps the panel alive on membersError so the only restore affordance
      // survives a members outage — which means `holders: []` there is "unknown", not zero.
      // Asserting "0 miembros activos" as fact would understate the blast radius of a write
      // that fans out through an unbounded no-retry members scan.
      const user = userEvent.setup();
      render(<RolesPanel rows={[rowFor(dead)]} holdersState={state} />);
      await user.click(screen.getByRole("button", { name: "Reactivar rol" }));

      expect(screen.getByText(/desconocido/i)).toBeInTheDocument();
      expect(screen.queryByText(/0 miembros activos/)).not.toBeInTheDocument();
    },
  );

  it("still states the count when the holders query is ok", async () => {
    const user = userEvent.setup();
    render(<RolesPanel rows={[rowFor(dead)]} holdersState="ok" />);
    await user.click(screen.getByRole("button", { name: "Reactivar rol" }));
    expect(screen.getByText(/0 miembros activos/)).toBeInTheDocument();
    expect(screen.queryByText(/desconocido/i)).not.toBeInTheDocument();
  });

  it("BLOCKING: does not assert a holder count in the EDITOR while holders are degraded", async () => {
    // The editor's deactivate paragraph is the same last-human-check before the same
    // unbounded fan-out, so it owes the same honesty.
    const user = userEvent.setup();
    render(<RolesPanel rows={[rowFor(customDoc)]} holdersState="error" />);
    await user.click(screen.getByRole("button", { name: "Editar" }));

    expect(screen.getByText(/número desconocido de miembros activos/i)).toBeInTheDocument();
    expect(screen.queryByText(/Afecta a 0 miembros activos/)).not.toBeInTheDocument();
  });
});

describe("RolesPanel ghost doc (active: true + deletedAt set)", () => {
  it("BLOCKING: offers Reactivar rol and NOT Desactivar rol — never both", async () => {
    // A console-produced ghost is live to where('active','==',true) and dead to beacon's
    // isActiveRoleDoc. RolesPanel routes through isLiveRole via row.active; the editor read
    // raw role.active, so the two buttons appeared side by side.
    const user = userEvent.setup();
    const ghost = { ...customDoc, active: true, deletedAt: DELETED_AT };
    render(<RolesPanel rows={[rowFor(ghost)]} />);

    expect(screen.getByRole("button", { name: "Reactivar rol" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Editar" }));
    expect(screen.queryByRole("button", { name: "Desactivar rol" })).not.toBeInTheDocument();
  });
});
