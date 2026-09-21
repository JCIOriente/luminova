import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { Timestamp } from "firebase/firestore";
import type { Member, Position } from "@luminova/types";
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

const cargo = (id: string, grants: Position["grants"]): Position => ({
  id,
  title: id,
  titleFemale: id,
  category: "CEL",
  grants,
  term: null,
  sigla: null,
  description: "",
  active: true,
  deletedAt: null,
});

// The catalog the row menu resolves seated cargos against. `pos-power` confers a role, so
// beacon's power-seat guard refuses a non-Admin provisioning its holder; `pos-plain` is the
// grant-free control that proves the gate keys on the grants, not on being seated at all.
const POSITIONS_BY_ID: ReadonlyMap<string, Position> = new Map([
  ["pos-power", cargo("pos-power", ["Secretary"])],
  ["pos-plain", cargo("pos-plain", [])],
]);

// Render the menu behind the REAL Can/ActionGate wiring so the per-item authz gates are
// actually exercised (the previous suite mocked both to always-render children, making
// every "is visible" assertion unconditionally true). uid="admin" so no uid-scoped
// conditional grant muddies the coarse gates under test.
function renderMenu(
  m: Member,
  claims: AuthClaims,
  overrides?: Partial<typeof handlers>,
  positionsById: ReadonlyMap<string, Position> = POSITIONS_BY_ID,
) {
  return render(
    <AbilityProvider claims={claims} uid="admin">
      <MemberRowMenu member={m} positionsById={positionsById} {...handlers} {...overrides} />
    </AbilityProvider>,
  );
}

const ADMIN: AuthClaims = roleClaims("Admin");
// The delegation principal: create:MemberLogin without the Admin role. update:Member is what
// keeps the menu itself reachable.
const DELEGATE: AuthClaims = {
  roles: ["Member"],
  perms: ["update:Member", "create:MemberLogin"],
};
const seated = (cargoId: string | null, term = "2026") => ({
  positions: { [term]: { cargoId, comisionIds: [] } },
});

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
        <MemberRowMenu
          member={member({ status: "Activo", uid: "self" })}
          positionsById={POSITIONS_BY_ID}
          {...handlers}
        />
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

  it("shows the invite item to a create:MemberLogin delegate with no privileged role", async () => {
    // The affordance moved off the Admin ROLE onto canProvisionLogin, mirroring beacon's
    // requireAdminOrPerm. update:Member is what keeps the menu itself reachable.
    renderMenu(member({ status: "Activo" }), {
      roles: ["Member"],
      perms: ["update:Member", "create:MemberLogin"],
    });
    await userEvent.click(screen.getByLabelText(/Acciones para Ana/));
    expect(screen.getByText("Invitar a la app")).toBeInTheDocument();
  });

  it("BLOCKING: hides the invite item from a manage:all perm holder without the Admin role", async () => {
    // Exact-code gate, matching the callable. A wildcard holder clicking this would get a
    // permission-denied from beacon after the fact.
    renderMenu(member({ status: "Activo" }), { roles: ["Member"], perms: ["manage:all"] });
    await userEvent.click(screen.getByLabelText(/Acciones para Ana/));
    expect(screen.queryByText("Invitar a la app")).not.toBeInTheDocument();
  });

  // --- memberProvisionBlocked, the non-Admin half of the invite gate ---
  //
  // Every case above renders either a member with NO uid or an Admin caller, so the second
  // disjunct of the old `isAdmin || !member.uid` gate was never the deciding term and the
  // whole conjunct survived deletion. These pin each refusal `provisionMember` applies to a
  // NON-Admin caller: adoption, direct grants, and a power-granting cargo in any term.

  const openMenu = () => userEvent.click(screen.getByLabelText(/Acciones para Ana/));

  it("shows the invite item to a delegate for a clean, unseated member", async () => {
    renderMenu(member({ status: "Activo" }), DELEGATE);
    await openMenu();
    expect(screen.getByText("Invitar a la app")).toBeInTheDocument();
  });

  it("shows it to a delegate for a member seated on a GRANT-FREE cargo", async () => {
    // The control for the two cases below: being seated is not the blocker, conferring power
    // is. Without this the cargo clause could be "seated at all" and nothing would notice.
    renderMenu(member({ status: "Activo", ...seated("pos-plain") }), DELEGATE);
    await openMenu();
    expect(screen.getByText("Invitar a la app")).toBeInTheDocument();
  });

  it("BLOCKING: hides it from a delegate for a member who already has a login (adoption)", async () => {
    // beacon tags this reprovision-requires-admin: a delegate may only mint a NEW login, so
    // "Reenviar invitación" would 403 on every click.
    renderMenu(member({ status: "Activo", uid: "u1" }), DELEGATE);
    await openMenu();
    expect(screen.queryByText("Reenviar invitación")).not.toBeInTheDocument();
  });

  it("BLOCKING: hides it from a delegate for a member seated on a power-granting cargo", async () => {
    renderMenu(member({ status: "Activo", ...seated("pos-power") }), DELEGATE);
    await openMenu();
    expect(screen.queryByText("Invitar a la app")).not.toBeInTheDocument();
  });

  it("BLOCKING: hides it from a delegate for a member carrying direct roleIds", async () => {
    renderMenu(member({ status: "Activo", roleIds: ["custom-role"] }), DELEGATE);
    await openMenu();
    expect(screen.queryByText("Invitar a la app")).not.toBeInTheDocument();
  });

  it("BLOCKING: hides it from a delegate while the cargo catalog is still empty (fails closed)", async () => {
    // The positions query has not landed, so the seated id resolves to undefined. Fail closed:
    // offer the invite once the catalog arrives rather than offer it and then 403.
    renderMenu(
      member({ status: "Activo", ...seated("pos-power") }),
      DELEGATE,
      undefined,
      new Map(),
    );
    await openMenu();
    expect(screen.queryByText("Invitar a la app")).not.toBeInTheDocument();
  });

  // BLOCKING: an EMPTY-STRING cargoId is a MALFORMED seat, not an empty one, and the gate used
  // to drop it with a truthiness test — so this member looked unseated, the invite was offered,
  // and the click 403'd with power-seat-requires-admin naming a cargo that does not exist.
  // beacon's readCargoIds pushes "" on purpose ("a malformed shape must never read as 'no
  // cargo' — that is the guard's own bypass") and refuses it at isSafeDocId; the client now
  // lets it fall through to the unresolvable-cargo clause and fails closed the same way.
  it("BLOCKING: hides it from a delegate for a member whose cargoId is an empty string", async () => {
    renderMenu(member({ status: "Activo", ...seated("") }), DELEGATE);
    await openMenu();
    expect(screen.queryByText("Invitar a la app")).not.toBeInTheDocument();
  });

  // The paired negative, so the fix cannot be over-applied into "any falsy cargoId blocks": a
  // null cargoId is a genuinely unseated term (readCargoIds `continue`s past it) and is the
  // ordinary shape of most member docs. Blocking here would hide the invite chapter-wide.
  it("shows it to a delegate for a member whose term has a NULL cargoId", async () => {
    renderMenu(member({ status: "Activo", ...seated(null) }), DELEGATE);
    await openMenu();
    expect(screen.getByText("Invitar a la app")).toBeInTheDocument();
  });

  it("still shows it to an Admin in every one of those cases", async () => {
    for (const m of [
      member({ status: "Activo", uid: "u1" }),
      member({ status: "Activo", ...seated("pos-power") }),
      member({ status: "Activo", ...seated("") }),
      member({ status: "Activo", roleIds: ["custom-role"] }),
    ]) {
      const { unmount } = renderMenu(m, ADMIN);
      await openMenu();
      expect(
        screen.getByText(m.uid ? "Reenviar invitación" : "Invitar a la app"),
      ).toBeInTheDocument();
      unmount();
    }
  });
});
