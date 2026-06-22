import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import type { Member, RoleDefinition } from "@luminova/types";

const customRole: RoleDefinition = {
  id: "c1",
  name: "Coordinador",
  description: "",
  builtIn: false,
  builtInKey: null,
  permissions: ["manage:Event"],
  locked: false,
  active: true,
  deletedAt: null,
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
    // Treasury → manage:Payment, read:Member, read:MemberPoints.
    expect(screen.getByText("Gestionar Pagos")).toBeInTheDocument();
    expect(screen.getByText("Ver Miembros")).toBeInTheDocument();
  });

  it("includes a directly-assigned custom role's perms in the preview", () => {
    const withRole = { ...member, roleIds: ["c1"] } as unknown as Member;
    render(<MemberRolesPanel member={withRole} builtInRoleNames={[]} />);
    expect(screen.getByText("Gestionar Eventos")).toBeInTheDocument();
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
});
