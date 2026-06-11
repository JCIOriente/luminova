import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { PositionSection } from "./position-table";
import { AbilityProvider } from "../../../lib/authz/ability-context";
import type { Position } from "@luminova/types";

function renderAsAdmin(ui: ReactElement) {
  return render(
    <AbilityProvider claims={{ roles: ["Admin"] }} uid="admin">
      {ui}
    </AbilityProvider>,
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

  it("hides row actions for a role without write access", () => {
    render(
      <AbilityProvider claims={{ roles: ["Member"] }} uid="m1">
        <PositionSection
          title="Cargos"
          positions={[cargo]}
          variant="cargo"
          onEdit={vi.fn()}
          onDeactivate={vi.fn()}
        />
      </AbilityProvider>,
    );
    expect(screen.queryByRole("button", { name: /editar tesorero/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /desactivar tesorero/i })).toBeNull();
  });
});
