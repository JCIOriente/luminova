import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Timestamp } from "firebase/firestore";
import type { ReactElement } from "react";
import { MemberTable } from "./member-table";
import { AbilityProvider } from "../../../lib/authz/ability-context";
import { currentTermKey, type Member, type Position } from "@luminova/types";

const noop = {
  roleLabel: () => "Miembro",
  positionsById: new Map<string, Position>(),
  onView: vi.fn(),
  onEdit: vi.fn(),
  onProvision: vi.fn(),
  onSetStatus: vi.fn(),
  onDelete: vi.fn(),
};

function renderAsAdmin(ui: ReactElement) {
  return render(
    <AbilityProvider claims={{ roles: ["Admin"] }} uid="admin">
      {ui}
    </AbilityProvider>,
  );
}

const member: Member = {
  id: "m1",
  name: "Ana Pérez",
  email: "ana@jci.bo",
  joinDate: Timestamp.fromDate(new Date("2021-03-01T00:00:00Z")),
  birthdate: Timestamp.fromDate(new Date("1992-07-01T00:00:00Z")),
  status: "Activo",
  profilePicture: null,
  totalPoints: 0,
  active: true,
  deletedAt: null,
};

describe("MemberTable", () => {
  it("renders the status badge, name and join year", () => {
    renderAsAdmin(<MemberTable members={[member]} pageSize={8} {...noop} />);
    expect(screen.getByText("Ana Pérez")).toBeInTheDocument();
    expect(within(screen.getByRole("table")).getByText("Activo")).toBeInTheDocument();
    expect(screen.getByText("2021")).toBeInTheDocument();
  });

  it("calls onEdit from the row menu", async () => {
    const onEdit = vi.fn();
    renderAsAdmin(<MemberTable members={[member]} pageSize={8} {...noop} onEdit={onEdit} />);
    await userEvent.click(screen.getByRole("button", { name: /acciones para ana pérez/i }));
    await userEvent.click(screen.getByText("Editar miembro"));
    expect(onEdit).toHaveBeenCalledWith(member);
  });

  it("calls onView from the row menu", async () => {
    const onView = vi.fn();
    renderAsAdmin(<MemberTable members={[member]} pageSize={8} {...noop} onView={onView} />);
    await userEvent.click(screen.getByRole("button", { name: /acciones para ana pérez/i }));
    await userEvent.click(screen.getByText("Ver perfil"));
    expect(onView).toHaveBeenCalledWith(member);
  });

  it("shows an empty state when there are no members", () => {
    renderAsAdmin(<MemberTable members={[]} pageSize={8} {...noop} />);
    expect(screen.getByText(/no hay miembros/i)).toBeInTheDocument();
  });

  it("hides write actions for a read-only role", async () => {
    render(
      <AbilityProvider claims={{ roles: ["Treasury"] }} uid="t">
        <MemberTable members={[member]} pageSize={8} {...noop} />
      </AbilityProvider>,
    );
    await userEvent.click(screen.getByRole("button", { name: /acciones para ana pérez/i }));
    expect(screen.getByText("Ver perfil")).toBeInTheDocument();
    expect(screen.queryByText("Editar miembro")).toBeNull();
    expect(screen.queryByText("Eliminar miembro")).toBeNull();
    expect(screen.queryByText("Desactivar")).toBeNull();
  });

  it("renders a gendered cargo chip when positionsById has the member's cargo", () => {
    const position: Position = {
      id: "p1",
      title: "Tesorero",
      titleFemale: "Tesorera",
      category: "CEL",
      grants: [],
      term: null,
      description: "",
      active: true,
      deletedAt: null,
    };
    const positionsById = new Map<string, Position>([["p1", position]]);
    const memberWithCargo: Member = {
      ...member,
      gender: "Masculino",
      positions: { [currentTermKey()]: { cargoId: "p1", comisionIds: [] } },
    };
    renderAsAdmin(
      <MemberTable
        members={[memberWithCargo]}
        pageSize={8}
        {...noop}
        positionsById={positionsById}
      />,
    );
    expect(screen.getByText("Tesorero")).toBeInTheDocument();
  });

  it("renders a Miembro chip in the cargo cell when the member has no assignment", () => {
    renderAsAdmin(<MemberTable members={[member]} pageSize={8} {...noop} />);
    const rows = screen.getAllByRole("row");
    const dataRow = rows.find((r) => within(r).queryByText("Ana Pérez") !== null);
    expect(dataRow).toBeDefined();
    expect(within(dataRow!).getByText("Miembro")).toBeInTheDocument();
  });
});
