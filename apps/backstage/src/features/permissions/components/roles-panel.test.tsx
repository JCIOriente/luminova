import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import type { RoleDefinition } from "@luminova/types";
import type { RoleOverviewRow } from "../lib/role-overview";

const addMutate = vi.fn().mockResolvedValue("new-id");
const updateMutate = vi.fn().mockResolvedValue(undefined);
const deleteMutate = vi.fn().mockResolvedValue(undefined);
vi.mock("../hooks/use-save-role", () => ({
  useAddRole: () => ({ mutateAsync: addMutate }),
  useUpdateRole: () => ({ mutateAsync: updateMutate }),
  useDeleteRole: () => ({ mutateAsync: deleteMutate }),
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
  grantingCargos: [],
  holders: [],
};

function rowFor(doc: RoleDefinition, over: Partial<RoleOverviewRow> = {}): RoleOverviewRow {
  return {
    role: doc,
    id: doc.id,
    builtInKey: doc.builtInKey,
    label: doc.name,
    description: doc.description,
    permissions: doc.permissions,
    grantingCargos: [],
    holders: [],
    ...over,
  };
}

beforeEach(() => {
  addMutate.mockClear();
  updateMutate.mockClear();
  deleteMutate.mockClear();
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
});
