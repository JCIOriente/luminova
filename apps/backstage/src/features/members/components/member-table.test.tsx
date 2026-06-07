import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Timestamp } from "firebase/firestore";
import type { ReactElement } from "react";
import { MemberTable } from "./member-table";
import { AbilityProvider } from "../../../lib/authz/ability-context";
import type { Member } from "@luminova/types";

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
  role: "Presidenta",
  joinDate: Timestamp.fromDate(new Date("2021-03-01T00:00:00Z")),
  birthdate: Timestamp.fromDate(new Date("1992-07-01T00:00:00Z")),
  status: "Activo",
  profilePicture: null,
  totalPoints: 0,
  active: true,
  deletedAt: null,
};

const other: Member = {
  ...member,
  id: "m2",
  name: "Beto Soliz",
  email: "beto@jci.bo",
  role: "Tesorero",
  status: "Inactivo",
  totalPoints: 50,
};

describe("MemberTable", () => {
  it("renders the status as a badge and a name", () => {
    renderAsAdmin(
      <MemberTable members={[member]} onView={vi.fn()} onEdit={vi.fn()} onDelete={vi.fn()} />,
    );
    expect(screen.getByText("Ana Pérez")).toBeInTheDocument();
    const statusBadge = within(screen.getByRole("table")).getByText("Activo");
    expect(statusBadge).toBeInTheDocument();
  });

  it("calls onEdit when the edit action is used", async () => {
    const onEdit = vi.fn();
    renderAsAdmin(
      <MemberTable members={[member]} onView={vi.fn()} onEdit={onEdit} onDelete={vi.fn()} />,
    );
    await userEvent.click(screen.getByRole("button", { name: /editar a ana pérez/i }));
    expect(onEdit).toHaveBeenCalledWith(member);
  });

  it("calls onView when the view action is used", async () => {
    const onView = vi.fn();
    renderAsAdmin(
      <MemberTable members={[member]} onView={onView} onEdit={vi.fn()} onDelete={vi.fn()} />,
    );
    await userEvent.click(screen.getByRole("button", { name: /ver a ana pérez/i }));
    expect(onView).toHaveBeenCalledWith(member);
  });

  it("filters rows as the user types in the search box", async () => {
    renderAsAdmin(
      <MemberTable
        members={[member, other]}
        onView={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    expect(screen.getByText("Ana Pérez")).toBeInTheDocument();
    expect(screen.getByText("Beto Soliz")).toBeInTheDocument();

    await userEvent.type(screen.getByPlaceholderText(/buscar/i), "beto");

    expect(screen.queryByText("Ana Pérez")).toBeNull();
    expect(screen.getByText("Beto Soliz")).toBeInTheDocument();
  });

  it("shows an empty state when there are no members", () => {
    renderAsAdmin(
      <MemberTable members={[]} onView={vi.fn()} onEdit={vi.fn()} onDelete={vi.fn()} />,
    );
    expect(screen.getByText(/no hay miembros/i)).toBeInTheDocument();
  });

  it("hides row actions for a role without write access", () => {
    render(
      <AbilityProvider claims={{ roles: ["Treasury"] }} uid="t">
        <MemberTable members={[member]} onView={vi.fn()} onEdit={vi.fn()} onDelete={vi.fn()} />
      </AbilityProvider>,
    );
    expect(screen.queryByRole("button", { name: /editar a ana pérez/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /eliminar a ana pérez/i })).toBeNull();
  });
});
