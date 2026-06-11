import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { Timestamp } from "firebase/firestore";
import { currentTermKey, type Member, type Position } from "@luminova/types";
import { MemberDrawer } from "./member-drawer";
import { AbilityProvider } from "../../../lib/authz/ability-context";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: React.ReactNode }) => <a href="#">{children}</a>,
}));

const m: Member = {
  id: "1",
  name: "Ana Gómez",
  email: "ana@j.bo",
  role: "Tesorera",
  gender: "Femenino",
  joinDate: Timestamp.fromDate(new Date("2021-01-01T00:00:00Z")),
  birthdate: Timestamp.fromDate(new Date("1990-01-01T00:00:00Z")),
  status: "Activo",
  profilePicture: null,
  totalPoints: 7,
  active: true,
  deletedAt: null,
};

const positions: Position[] = [
  {
    id: "pos-pres",
    title: "Presidente",
    titleFemale: "Presidenta",
    category: "CEL",
    grants: [],
    term: null,
    description: "Preside el capítulo.",
    active: true,
    deletedAt: null,
  },
  {
    id: "pos-eventos",
    title: "Comisión de Eventos",
    titleFemale: "Comisión de Eventos",
    category: "Comision",
    grants: [],
    term: null,
    description: "Organiza los eventos.",
    active: true,
    deletedAt: null,
  },
];

describe("MemberDrawer view mode", () => {
  it("shows the member summary and switches to edit", () => {
    const onEditMode = vi.fn();
    render(
      <AbilityProvider claims={{ roles: ["Admin"] }} uid="admin">
        <MemberDrawer
          open
          mode="view"
          member={m}
          positions={[]}
          onClose={() => {}}
          onEditMode={onEditMode}
          onSubmit={async () => {}}
        />
      </AbilityProvider>,
    );
    expect(screen.getByText("ana@j.bo")).toBeInTheDocument();
    expect(screen.getByText("2021")).toBeInTheDocument();
    expect(screen.getByText("7")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Editar perfil"));
    expect(onEditMode).toHaveBeenCalled();
  });

  it("shows phone and profession labels and the legacy role as cargo", () => {
    render(
      <AbilityProvider claims={{ roles: ["Admin"] }} uid="admin">
        <MemberDrawer
          open
          mode="view"
          member={m}
          positions={[]}
          onClose={() => {}}
          onEditMode={() => {}}
          onSubmit={async () => {}}
        />
      </AbilityProvider>,
    );
    expect(screen.getByText("Teléfono")).toBeInTheDocument();
    expect(screen.getByText("Profesión")).toBeInTheDocument();
    expect(screen.getByText("Cargo")).toBeInTheDocument();
    expect(screen.getByText("Tesorera")).toBeInTheDocument();
  });

  it("shows gendered cargo and comisión chips when assignments exist", () => {
    const assigned: Member = {
      ...m,
      positions: { [currentTermKey()]: { cargoId: "pos-pres", comisionIds: ["pos-eventos"] } },
    };
    render(
      <AbilityProvider claims={{ roles: ["Admin"] }} uid="admin">
        <MemberDrawer
          open
          mode="view"
          member={assigned}
          positions={positions}
          onClose={() => {}}
          onEditMode={() => {}}
          onSubmit={async () => {}}
        />
      </AbilityProvider>,
    );
    expect(screen.getAllByText("Presidenta")).not.toHaveLength(0);
    expect(screen.getByText("Comisión de Eventos")).toBeInTheDocument();
  });
});
