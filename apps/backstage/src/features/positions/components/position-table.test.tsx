import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { PositionTable, PositionSection } from "./position-table";
import { AbilityProvider } from "../../../lib/authz/ability-context";
import type { Position } from "@luminova/types";

function renderAsAdmin(ui: ReactElement) {
  return render(
    <AbilityProvider claims={{ roles: ["Admin"] }} uid="admin">
      {ui}
    </AbilityProvider>,
  );
}

const jdlPosition: Position = {
  id: "p1",
  title: "Director de Miembro Individual",
  titleFemale: "Directora de Miembro Individual",
  category: "JDL",
  grants: ["Membership"],
  term: 2025,
  description: "Acompaña a los miembros individuales.",
  active: true,
  deletedAt: null,
} as Position;

const comisionPosition: Position = {
  id: "p2",
  title: "Director de Ética",
  titleFemale: "Directora de Ética",
  category: "Comision",
  grants: [],
  term: null,
  description: "Vela por el código de ética.",
  active: true,
  deletedAt: null,
} as Position;

describe("PositionTable", () => {
  it("renders the position title and female variant", () => {
    renderAsAdmin(
      <PositionTable positions={[jdlPosition]} onEdit={vi.fn()} onDeactivate={vi.fn()} />,
    );
    expect(screen.getByText("Director de Miembro Individual")).toBeInTheDocument();
    expect(screen.getByText("Directora de Miembro Individual")).toBeInTheDocument();
  });

  it("renders the Comisión badge label for comision category", () => {
    renderAsAdmin(
      <PositionTable positions={[comisionPosition]} onEdit={vi.fn()} onDeactivate={vi.fn()} />,
    );
    expect(screen.getByText("Comisión")).toBeInTheDocument();
  });

  it("renders '—' for null term", () => {
    renderAsAdmin(
      <PositionTable positions={[comisionPosition]} onEdit={vi.fn()} onDeactivate={vi.fn()} />,
    );
    const dashes = screen.getAllByText("—");
    expect(dashes.length).toBeGreaterThanOrEqual(1);
    const termCell = dashes.find((el) => el.closest("td.tabular-nums") !== null);
    expect(termCell).toBeDefined();
  });

  it("renders grants label joined for positions with grants", () => {
    renderAsAdmin(
      <PositionTable positions={[jdlPosition]} onEdit={vi.fn()} onDeactivate={vi.fn()} />,
    );
    expect(screen.getByText("Membresía")).toBeInTheDocument();
  });

  it("renders '—' for empty grants", () => {
    renderAsAdmin(
      <PositionTable positions={[comisionPosition]} onEdit={vi.fn()} onDeactivate={vi.fn()} />,
    );
    const dashes = screen.getAllByText("—");
    expect(dashes.length).toBeGreaterThanOrEqual(1);
  });

  it("calls onEdit when the edit action is used", async () => {
    const onEdit = vi.fn();
    renderAsAdmin(
      <PositionTable positions={[jdlPosition]} onEdit={onEdit} onDeactivate={vi.fn()} />,
    );
    await userEvent.click(
      screen.getByRole("button", { name: /editar director de miembro individual/i }),
    );
    expect(onEdit).toHaveBeenCalledWith(jdlPosition);
  });

  it("calls onDeactivate when the deactivate action is used", async () => {
    const onDeactivate = vi.fn();
    renderAsAdmin(
      <PositionTable positions={[jdlPosition]} onEdit={vi.fn()} onDeactivate={onDeactivate} />,
    );
    await userEvent.click(
      screen.getByRole("button", { name: /desactivar director de miembro individual/i }),
    );
    expect(onDeactivate).toHaveBeenCalledWith(jdlPosition);
  });

  it("hides row actions for a role without write access", () => {
    render(
      <AbilityProvider claims={{ roles: ["Member"] }} uid="m1">
        <PositionTable positions={[jdlPosition]} onEdit={vi.fn()} onDeactivate={vi.fn()} />
      </AbilityProvider>,
    );
    expect(
      screen.queryByRole("button", { name: /editar director de miembro individual/i }),
    ).toBeNull();
    expect(
      screen.queryByRole("button", { name: /desactivar director de miembro individual/i }),
    ).toBeNull();
  });
});

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
});
