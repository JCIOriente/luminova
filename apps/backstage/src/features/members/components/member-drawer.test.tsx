import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { Timestamp } from "firebase/firestore";
import { currentTermKey, type Member, type Position } from "@luminova/types";
import { MemberDrawer } from "./member-drawer";
import { roleClaims } from "@luminova/auth/test-helpers";
import { AbilityProvider } from "../../../lib/authz/ability-context";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: React.ReactNode }) => <a href="#">{children}</a>,
}));

// The drawer now reads the caller's uid to decide whether the row it opened is the caller's
// OWN (the members table lists it too), which makes the edit a SELF-assignment. Mocked as a
// factory with no `importOriginal`: lib/auth/auth builds its store from getFirebase().auth at
// module scope, so merely evaluating the real module initializes Firebase and the whole file
// fails to collect. uid "someone-else" keeps every case below a non-self edit.
vi.mock("../../../lib/auth/auth", () => ({
  useAuth: () => ({ user: { uid: "someone-else" }, claims: { roles: ["Admin"] } }),
}));

const m: Member = {
  id: "1",
  name: "Ana Gómez",
  email: "ana@j.bo",
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
    titleFemale: null,
    sigla: "CEV",
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
      <AbilityProvider claims={roleClaims("Admin")} uid="admin">
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

  it("shows phone and profession labels and falls back to Miembro when no cargo is set", () => {
    render(
      <AbilityProvider claims={roleClaims("Admin")} uid="admin">
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
    expect(screen.getByText("Miembro")).toBeInTheDocument();
  });

  it("shows gendered cargo and comisión chips when assignments exist", () => {
    const assigned: Member = {
      ...m,
      positions: { [currentTermKey()]: { cargoId: "pos-pres", comisionIds: ["pos-eventos"] } },
    };
    render(
      <AbilityProvider claims={roleClaims("Admin")} uid="admin">
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
    // Comisión badge shows the sigla, never a gender-derived title (titleFemale is null).
    expect(screen.getByText("CEV")).toBeInTheDocument();
    expect(screen.queryByText(/Comisióna/)).not.toBeInTheDocument();
  });
});
