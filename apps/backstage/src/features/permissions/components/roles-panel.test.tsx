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

const adminDoc: RoleDefinition = {
  id: "Admin",
  name: "Administrador",
  description: "Acceso total a la plataforma.",
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

beforeEach(() => {
  addMutate.mockClear();
  updateMutate.mockClear();
  deleteMutate.mockClear();
});

describe("RolesPanel", () => {
  it("renders one row per role with its cargos and holders", () => {
    const rows: RoleOverviewRow[] = [
      {
        role: adminDoc,
        grantingCargos: ["Presidente"],
        holders: [{ id: "m0", name: "Olivia" }],
      },
    ];
    render(<RolesPanel rows={rows} />);
    expect(screen.getByText("Administrador")).toBeInTheDocument();
    expect(screen.getByText("Acceso total a la plataforma.")).toBeInTheDocument();
    expect(screen.getByText(/Presidente/)).toBeInTheDocument();
    expect(screen.getByText(/Olivia/)).toBeInTheDocument();
  });

  it("labels a custom role's origin as direct assignment", () => {
    // "Otorgado por: <cargo>" is structurally impossible for a custom role.
    render(<RolesPanel rows={[{ role: customDoc, grantingCargos: [], holders: [] }]} />);
    expect(screen.getByText(/Asignación directa/)).toBeInTheDocument();
  });

  it("truncates a long holder list", () => {
    // The Miembro row lists the whole chapter; 7 holders must render 5 names + "y 2 más".
    const holders = Array.from({ length: 7 }, (_, i) => ({ id: `m${i}`, name: `Socio${i}` }));
    render(<RolesPanel rows={[{ role: adminDoc, grantingCargos: [], holders }]} />);
    expect(screen.getByText(/y 2 más/)).toBeInTheDocument();
    expect(screen.queryByText(/Socio5/)).not.toBeInTheDocument();
  });

  it("renders an empty state when there are no role docs", () => {
    render(<RolesPanel rows={[]} />);
    expect(screen.getByText(/No hay roles configurados/)).toBeInTheDocument();
  });
});
