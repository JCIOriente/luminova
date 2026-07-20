import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { RoleDefinition } from "@luminova/types";

const adminRole: RoleDefinition = {
  id: "Admin",
  name: "Administrador",
  description: "",
  builtIn: true,
  builtInKey: "Admin",
  permissions: ["manage:all"],
  locked: true,
  active: true,
  deletedAt: null,
};
const customRole: RoleDefinition = {
  id: "c1",
  name: "Coordinador",
  description: "",
  builtIn: false,
  builtInKey: null,
  permissions: ["manage:Position"],
  locked: false,
  active: true,
  deletedAt: null,
};

let rolesData: RoleDefinition[];
vi.mock("../hooks/use-roles", () => ({
  useRoles: () => ({ data: rolesData, isLoading: false }),
}));
const addMutate = vi.fn().mockResolvedValue("new-id");
const updateMutate = vi.fn().mockResolvedValue(undefined);
const deleteMutate = vi.fn().mockResolvedValue(undefined);
vi.mock("../hooks/use-save-role", () => ({
  useAddRole: () => ({ mutateAsync: addMutate }),
  useUpdateRole: () => ({ mutateAsync: updateMutate }),
  useDeleteRole: () => ({ mutateAsync: deleteMutate }),
}));

import { RoleManager } from "./role-manager";

beforeEach(() => {
  rolesData = [adminRole, customRole];
  addMutate.mockClear();
  updateMutate.mockClear();
  deleteMutate.mockClear();
});

describe("RoleManager", () => {
  it("lists roles with built-in/custom badges and a locked marker for Admin", () => {
    render(<RoleManager />);
    expect(screen.getByText("Administrador")).toBeInTheDocument();
    expect(screen.getByText("Coordinador")).toBeInTheDocument();
    expect(screen.getByText("Protegido")).toBeInTheDocument();
    expect(screen.getByText("Personalizado")).toBeInTheDocument();
    expect(screen.getAllByText("Predefinido").length).toBeGreaterThan(0);
  });

  it("opens the editor (matrix) when creating a new role", () => {
    render(<RoleManager />);
    fireEvent.click(screen.getByRole("button", { name: /crear rol/i }));
    // The RoleEditor matrix header only renders once the sheet is open.
    expect(screen.getByText("Recurso")).toBeInTheDocument();
  });

  it("opens the editor for an existing custom role on Editar", () => {
    render(<RoleManager />);
    const editButtons = screen.getAllByRole("button", { name: /editar|ver/i });
    const editar = editButtons.find((b) => b.textContent === "Editar");
    expect(editar).toBeDefined();
    fireEvent.click(editar!);
    expect(screen.getAllByText("Editar rol").length).toBeGreaterThan(0);
  });

  it("shows a read-only 'Ver' action for the locked Admin role", () => {
    render(<RoleManager />);
    expect(screen.getAllByRole("button", { name: /^ver$/i }).length).toBe(1);
  });
});
