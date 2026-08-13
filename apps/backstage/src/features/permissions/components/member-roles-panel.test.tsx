import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Member, RoleDefinition } from "@luminova/types";

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

// `deletedAt` set alongside `active: false` because that is the ONLY inactive shape
// production can hold: roleLifecycleSafe() in firestore.rules requires
// `deletedAt is timestamp` whenever active is false. Structural stand-in for a Timestamp —
// isLiveRole only tests null-ness.
const deactivatedRole: RoleDefinition = {
  id: "c_dead",
  name: "Coordinador Retirado",
  description: "",
  builtIn: false,
  builtInKey: null,
  permissions: ["manage:Ally"],
  locked: false,
  active: false,
  deletedAt: { seconds: 1, nanoseconds: 0 } as unknown as RoleDefinition["deletedAt"],
};

let rolesData: RoleDefinition[];
vi.mock("../hooks/use-roles", () => ({
  useRoles: () => ({ data: rolesData, isLoading: false }),
}));
const saveMutate = vi.fn().mockResolvedValue(undefined);
let pending = false;
let isError = false;
vi.mock("../hooks/use-save-member-permissions", () => ({
  useSaveMemberPermissions: () => ({ mutateAsync: saveMutate, isPending: pending, isError }),
}));

import { MemberRolesPanel } from "./member-roles-panel";

const member = {
  id: "m1",
  name: "Ana",
  roleIds: [],
  permissionOverrides: { grant: [], revoke: [] },
} as unknown as Member;

beforeEach(() => {
  rolesData = [customRole];
  saveMutate.mockClear();
  pending = false;
  isError = false;
});

describe("MemberRolesPanel", () => {
  it("previews effective perms from the member's built-in roles (seed fallback)", () => {
    render(<MemberRolesPanel member={member} builtInRoleNames={["Treasury"]} />);
    // Treasury → read:Member, read:MemberPoints.
    expect(screen.getByText("Ver Miembros")).toBeInTheDocument();
    expect(screen.getByText("Ver Puntos")).toBeInTheDocument();
  });

  it("includes a directly-assigned custom role's perms in the preview", () => {
    const withRole = { ...member, roleIds: ["c1"] } as unknown as Member;
    render(<MemberRolesPanel member={withRole} builtInRoleNames={[]} />);
    expect(screen.getByText("Gestionar Cargos")).toBeInTheDocument();
  });

  it("saves the current roleIds + overrides on Guardar", async () => {
    render(<MemberRolesPanel member={member} builtInRoleNames={["Treasury"]} />);
    fireEvent.click(screen.getByRole("button", { name: /guardar/i }));
    await waitFor(() =>
      expect(saveMutate).toHaveBeenCalledWith({
        memberId: "m1",
        roleIds: [],
        permissionOverrides: { grant: [], revoke: [] },
      }),
    );
  });

  it("BLOCKING: never offers a deactivated custom role for assignment", async () => {
    // useRoles() is now unfiltered so /permisos can restore a deactivated role. The
    // type system cannot express "this list must be filtered", so this test IS the
    // guard: assigning a deactivated role promises perms beacon will never mint
    // (getRolesByIds drops inactive docs).
    rolesData = [customRole, deactivatedRole];
    const user = userEvent.setup();
    render(<MemberRolesPanel member={member} builtInRoleNames={[]} />);

    // The trigger's accessible name is the wrapping <label>'s text, not the placeholder.
    await user.click(screen.getByRole("button", { name: "Roles personalizados" }));

    expect(screen.getByText("Coordinador")).toBeInTheDocument();
    expect(screen.queryByText("Coordinador Retirado")).not.toBeInTheDocument();
  });

  it("BLOCKING: surfaces a stored roleId whose doc is deactivated", async () => {
    // The chip vanishes on its own: MultiSelect renders chips by filtering options
    // against the value, and the deactivated role is no longer an option. Without an
    // explicit notice the admin sees a member with no custom roles while roleIds still
    // carries one — and a save would silently re-persist it.
    rolesData = [customRole, deactivatedRole];
    const withDead = { ...member, roleIds: ["c_dead"] } as unknown as Member;
    render(<MemberRolesPanel member={withDead} builtInRoleNames={[]} />);

    // role="status", not "alert": a persistent advisory that is already true at mount
    // must not interrupt assertively.
    const notice = screen.getByRole("status");
    expect(notice).toHaveTextContent("Coordinador Retirado");
    expect(notice).toHaveTextContent(/desactivado/i);
    // The stored assignment is preserved, not silently dropped.
    fireEvent.click(screen.getByRole("button", { name: /guardar/i }));
    await waitFor(() =>
      expect(saveMutate).toHaveBeenCalledWith({
        memberId: "m1",
        roleIds: ["c_dead"],
        permissionOverrides: { grant: [], revoke: [] },
      }),
    );
  });

  it("BLOCKING: the deactivated-role notice does not corrupt the trigger's accessible name", async () => {
    // A `button` is a labelable element, so the wrapping <label> IS the trigger's
    // accessible name — every child of it, notice included. With the notice inside, the
    // name became "Roles personalizados Coordinador Retirado está desactivado: …": the
    // field a screen reader announces stops matching the field on screen, and every
    // by-name query for it breaks the moment a member holds a deactivated role.
    rolesData = [customRole, deactivatedRole];
    const withDead = { ...member, roleIds: ["c_dead"] } as unknown as Member;
    render(<MemberRolesPanel member={withDead} builtInRoleNames={[]} />);

    expect(screen.getByRole("button", { name: "Roles personalizados" })).toBeInTheDocument();
    // And the notice is still there — the fix moves it, it does not drop it.
    expect(screen.getByText(/está desactivado/i)).toBeInTheDocument();
  });

  it("shows no deactivated-role notice when every stored role is live", () => {
    rolesData = [customRole, deactivatedRole];
    const withLive = { ...member, roleIds: ["c1"] } as unknown as Member;
    render(<MemberRolesPanel member={withLive} builtInRoleNames={[]} />);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("surfaces a deactivated BUILT-IN whose doc id is stored in roleIds", () => {
    // The options list is custom-only, so a built-in doc id in roleIds gets no chip
    // either. Filtering built-ins out of the notice too would leave that stored grant
    // invisible on every surface — beacon's getRolesByIds resolves a built-in doc id, so
    // the id really was minting perms before the deactivation.
    rolesData = [
      customRole,
      {
        ...deactivatedRole,
        id: "Treasury",
        name: "Tesorería",
        builtIn: true,
        builtInKey: "Treasury",
      },
    ];
    const withDeadBuiltIn = { ...member, roleIds: ["Treasury"] } as unknown as Member;
    render(<MemberRolesPanel member={withDeadBuiltIn} builtInRoleNames={[]} />);

    expect(screen.getByRole("status")).toHaveTextContent("Tesorería");
    expect(screen.getByRole("button", { name: "Roles personalizados" })).toBeInTheDocument();
  });
});
