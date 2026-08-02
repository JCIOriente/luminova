import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { Timestamp } from "firebase/firestore";
import type { Member } from "@luminova/types";
import type { AuthClaims } from "@luminova/auth/roles";
import { roleClaims } from "@luminova/auth/test-helpers";
import { AbilityProvider } from "../../../lib/authz/ability-context";
import { MemberRowMenu } from "./member-row-menu";

function member(p: Partial<Member>): Member {
  return {
    id: "1",
    name: "Ana",
    email: "a@j.bo",
    joinDate: Timestamp.now(),
    birthdate: Timestamp.now(),
    status: "Activo",
    profilePicture: null,
    totalPoints: 0,
    active: true,
    deletedAt: null,
    ...p,
  };
}

const noop = () => {};
const handlers = {
  onView: noop,
  onEdit: noop,
  onProvision: noop,
  onSetStatus: noop,
  onUnpublish: noop,
};

// Render the menu behind the REAL Can/ActionGate wiring so the per-item authz gates are
// actually exercised (the previous suite mocked both to always-render children, making
// every "is visible" assertion unconditionally true). uid="admin" so no uid-scoped
// conditional grant muddies the coarse gates under test.
function renderMenu(m: Member, claims: AuthClaims, overrides?: Partial<typeof handlers>) {
  return render(
    <AbilityProvider claims={claims} uid="admin">
      <MemberRowMenu member={m} {...handlers} {...overrides} />
    </AbilityProvider>,
  );
}

const ADMIN: AuthClaims = roleClaims("Admin");

describe("MemberRowMenu", () => {
  it("shows Desactivar for an active member and Invitar when no uid", async () => {
    renderMenu(member({ status: "Activo" }), ADMIN);
    await userEvent.click(screen.getByLabelText(/Acciones para Ana/));
    expect(screen.getByText("Desactivar")).toBeInTheDocument();
    expect(screen.getByText("Invitar a la app")).toBeInTheDocument();
    expect(screen.queryByText("Reactivar")).not.toBeInTheDocument();
  });

  it("shows Reactivar + Reenviar for an inactive member with uid", async () => {
    renderMenu(member({ status: "Inactivo", uid: "u1" }), ADMIN);
    await userEvent.click(screen.getByLabelText(/Acciones para Ana/));
    expect(screen.getByText("Reactivar")).toBeInTheDocument();
    expect(screen.getByText("Reenviar invitación")).toBeInTheDocument();
    expect(screen.queryByText("Desactivar")).not.toBeInTheDocument();
  });

  it("fires onSetStatus with Desafiliado from the Desafiliar item", async () => {
    const onSetStatus = vi.fn();
    const m = member({ status: "Activo" });
    renderMenu(m, ADMIN, { onSetStatus });
    await userEvent.click(screen.getByLabelText(/Acciones para Ana/));
    await userEvent.click(screen.getByText("Desafiliar"));
    expect(onSetStatus).toHaveBeenCalledWith(m, "Desafiliado");
  });

  it("offers the takedown only for a published member, and fires it", async () => {
    const onUnpublish = vi.fn();
    const m = member({ publicProfile: true });
    renderMenu(m, ADMIN, { onUnpublish });
    await userEvent.click(screen.getByLabelText(/Acciones para Ana/));
    await userEvent.click(screen.getByText("Revocar perfil público"));
    expect(onUnpublish).toHaveBeenCalledWith(m);
  });

  it("hides the takedown when the member is not published", async () => {
    renderMenu(member({ publicProfile: false }), ADMIN);
    await userEvent.click(screen.getByLabelText(/Acciones para Ana/));
    expect(screen.queryByText("Revocar perfil público")).not.toBeInTheDocument();
  });

  it("hides the takedown from a non-Admin who can update members", async () => {
    renderMenu(member({ publicProfile: true }), roleClaims("Membership"));
    await userEvent.click(screen.getByLabelText(/Acciones para Ana/));
    expect(screen.getByText("Editar miembro")).toBeInTheDocument();
    expect(screen.queryByText("Revocar perfil público")).not.toBeInTheDocument();
  });

  // The reported bug: a member holding only read:Member saw Editar / Desactivar /
  // Desafiliar on EVERY row, because the uid-scoped own-doc update grant answered the
  // menu's collection-level question. The gate now probes an empty instance, so the
  // own-doc grant cannot open a control that acts on another member's document — not
  // even on the caller's OWN row, which is what /me is for.
  it("hides write items from a plain Member with a coarse read:Member", async () => {
    const claims: AuthClaims = { roles: ["Member"], perms: ["read:Member"] };
    render(
      <AbilityProvider claims={claims} uid="self">
        <MemberRowMenu member={member({ status: "Activo", uid: "self" })} {...handlers} />
      </AbilityProvider>,
    );
    await userEvent.click(screen.getByLabelText(/Acciones para Ana/));
    expect(screen.getByText("Ver perfil")).toBeInTheDocument();
    expect(screen.queryByText("Editar miembro")).not.toBeInTheDocument();
    expect(screen.queryByText("Desactivar")).not.toBeInTheDocument();
    expect(screen.queryByText("Desafiliar")).not.toBeInTheDocument();
  });

  // The gates bite: a Treasury caller (read:Member, but no update:Member and not Admin)
  // sees the read-only item but neither the update-gated status controls nor the
  // Admin-only invite.
  it("hides update- and Admin-gated items from a Treasury caller", async () => {
    renderMenu(member({ status: "Activo" }), roleClaims("Treasury"));
    await userEvent.click(screen.getByLabelText(/Acciones para Ana/));
    expect(screen.getByText("Ver perfil")).toBeInTheDocument();
    expect(screen.queryByText("Editar miembro")).not.toBeInTheDocument();
    expect(screen.queryByText("Desactivar")).not.toBeInTheDocument();
    expect(screen.queryByText("Desafiliar")).not.toBeInTheDocument();
    expect(screen.queryByText("Invitar a la app")).not.toBeInTheDocument();
  });
});
