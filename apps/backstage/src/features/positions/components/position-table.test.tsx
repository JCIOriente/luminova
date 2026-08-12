import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PositionSection } from "./position-table";
import { roleClaims } from "@luminova/auth/test-helpers";
import { AbilityProvider } from "../../../lib/authz/ability-context";
import { roleKeys } from "../../permissions/hooks/role-keys";
import type { Position, RoleDefinition } from "@luminova/types";

function testClient(roleDocs?: RoleDefinition[]) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  if (roleDocs) client.setQueryData(roleKeys.all, roleDocs);
  return client;
}

function renderAsAdmin(ui: ReactElement, roleDocs?: RoleDefinition[]) {
  return render(
    <QueryClientProvider client={testClient(roleDocs)}>
      <AbilityProvider claims={roleClaims("Admin")} uid="admin">
        {ui}
      </AbilityProvider>
    </QueryClientProvider>,
  );
}

const cargo: Position = {
  id: "c1",
  title: "Tesorero",
  titleFemale: null,
  sigla: null,
  category: "CEL" as const,
  grants: ["Treasury" as const],
  term: null,
  description: "",
  active: true,
  deletedAt: null,
} as Position;

const com: Position = {
  id: "k1",
  title: "Comisión de Conducta y Ética",
  titleFemale: null,
  sigla: "CCE",
  category: "Comision" as const,
  grants: [],
  term: null,
  description: "",
  active: true,
  deletedAt: null,
} as Position;

describe("PositionSection", () => {
  it("cargo variant shows Permisos, no Sigla column", () => {
    renderAsAdmin(
      <PositionSection
        title="Cargos"
        positions={[cargo]}
        variant="cargo"
        onEdit={vi.fn()}
        onDeactivate={vi.fn()}
      />,
    );
    const table = screen.getByRole("table");
    expect(within(table).getByText("Permisos")).toBeInTheDocument();
    expect(within(table).queryByText("Sigla")).not.toBeInTheDocument();
    expect(within(table).getByText("Tesorero")).toBeInTheDocument();
  });

  it("comision variant shows Sigla, no Permisos column", () => {
    renderAsAdmin(
      <PositionSection
        title="Comisiones"
        positions={[com]}
        variant="comision"
        onEdit={vi.fn()}
        onDeactivate={vi.fn()}
      />,
    );
    const table = screen.getByRole("table");
    expect(within(table).getByText("Sigla")).toBeInTheDocument();
    expect(within(table).getByText("CCE")).toBeInTheDocument();
    expect(within(table).queryByText("Permisos")).not.toBeInTheDocument();
  });

  it("cargo variant renders EmptyState when positions is empty", () => {
    renderAsAdmin(
      <PositionSection
        title="Cargos"
        positions={[]}
        variant="cargo"
        onEdit={vi.fn()}
        onDeactivate={vi.fn()}
      />,
    );
    expect(screen.getByText("Sin cargos en esta categoría.")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("comision variant renders EmptyState when positions is empty", () => {
    renderAsAdmin(
      <PositionSection
        title="Comisiones"
        positions={[]}
        variant="comision"
        onEdit={vi.fn()}
        onDeactivate={vi.fn()}
      />,
    );
    expect(screen.getByText("Sin comisiones.")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("calls onEdit / onDeactivate from the row actions", async () => {
    const onEdit = vi.fn();
    const onDeactivate = vi.fn();
    renderAsAdmin(
      <PositionSection
        title="Cargos"
        positions={[cargo]}
        variant="cargo"
        onEdit={onEdit}
        onDeactivate={onDeactivate}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /editar tesorero/i }));
    expect(onEdit).toHaveBeenCalledWith(cargo);
    await userEvent.click(screen.getByRole("button", { name: /desactivar tesorero/i }));
    expect(onDeactivate).toHaveBeenCalledWith(cargo);
  });

  it("labels a cargo's grants from the live role doc, not a hardcoded map", () => {
    const projectCargo = { ...cargo, id: "c2", grants: ["ProjectManager" as const] } as Position;
    renderAsAdmin(
      <PositionSection
        title="Cargos"
        variant="cargo"
        positions={[projectCargo]}
        onEdit={vi.fn()}
        onDeactivate={vi.fn()}
      />,
      [
        {
          id: "ProjectManager",
          name: "Dirección de Proyectos",
          description: "",
          builtIn: true,
          builtInKey: "ProjectManager",
          permissions: [],
          locked: false,
          active: true,
          deletedAt: null,
        },
      ],
    );
    expect(screen.getByText(/Dirección de Proyectos/)).toBeInTheDocument();
  });

  it("BLOCKING: marks a deactivated grant so the column agrees with the picker", () => {
    // roleOptions already labels this "(desactivado)" in the grants picker, and the picker
    // and this column sit on the SAME screen — an unmarked column said the cargo confers
    // perms that beacon mints nothing for, while the edit form said otherwise.
    const projectCargo = { ...cargo, id: "c2", grants: ["ProjectManager" as const] } as Position;
    renderAsAdmin(
      <PositionSection
        title="Cargos"
        variant="cargo"
        positions={[projectCargo]}
        onEdit={vi.fn()}
        onDeactivate={vi.fn()}
      />,
      [
        {
          id: "ProjectManager",
          name: "Dirección de Proyectos",
          description: "",
          builtIn: true,
          builtInKey: "ProjectManager",
          permissions: [],
          locked: false,
          active: false,
          deletedAt: { seconds: 1, nanoseconds: 0 } as unknown as RoleDefinition["deletedAt"],
        },
      ],
    );
    expect(screen.getByText("Dirección de Proyectos (desactivado)")).toBeInTheDocument();
  });

  it("does not mark a grant whose role has no seeded doc (the snapshot fallback is live)", () => {
    renderAsAdmin(
      <PositionSection
        title="Cargos"
        positions={[cargo]}
        variant="cargo"
        onEdit={vi.fn()}
        onDeactivate={vi.fn()}
      />,
    );
    expect(screen.getByText("Tesorería")).toBeInTheDocument();
  });

  it("hides row actions for a role without write access", () => {
    render(
      <QueryClientProvider client={testClient()}>
        <AbilityProvider claims={{ roles: ["Member"] }} uid="m1">
          <PositionSection
            title="Cargos"
            positions={[cargo]}
            variant="cargo"
            onEdit={vi.fn()}
            onDeactivate={vi.fn()}
          />
        </AbilityProvider>
      </QueryClientProvider>,
    );
    expect(screen.queryByRole("button", { name: /editar tesorero/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /desactivar tesorero/i })).toBeNull();
  });
});
