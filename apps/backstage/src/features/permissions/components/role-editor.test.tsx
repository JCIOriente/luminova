import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import type { RoleDefinition } from "@luminova/types";
import { RoleEditor } from "./role-editor";

const builtInAdmin: RoleDefinition = {
  id: "Admin",
  name: "Administrador",
  description: "",
  builtIn: true,
  builtInKey: "Admin",
  permissions: ["manage:all"],
  locked: true,
  active: true,
  deletedAt: null,
};

describe("RoleEditor", () => {
  it("submits the name + toggled permission codes for a new role", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const { container } = render(<RoleEditor role={null} holderCount={null} onSubmit={onSubmit} />);

    fireEvent.change(screen.getByLabelText(/nombre/i), { target: { value: "Coordinador" } });
    const cell = container.querySelector<HTMLInputElement>("#perm-manage\\:Ally");
    expect(cell).not.toBeNull();
    fireEvent.click(cell!);

    fireEvent.click(screen.getByRole("button", { name: /crear rol/i }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith({
      name: "Coordinador",
      description: "",
      permissions: ["manage:Ally"],
    });
  });

  it("rejects an empty name without calling onSubmit", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<RoleEditor role={null} holderCount={null} onSubmit={onSubmit} />);
    fireEvent.click(screen.getByRole("button", { name: /crear rol/i }));
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("renders the locked Admin role read-only (no save button)", () => {
    render(<RoleEditor role={builtInAdmin} holderCount={null} onSubmit={vi.fn()} />);
    expect(screen.getByLabelText(/nombre/i)).toBeDisabled();
    expect(screen.queryByRole("button", { name: /guardar|crear/i })).not.toBeInTheDocument();
    expect(screen.getByText(/protegido/i)).toBeInTheDocument();
  });
});

const builtInTreasury: RoleDefinition = {
  id: "Treasury",
  name: "Tesorería",
  description: "",
  builtIn: true,
  builtInKey: "Treasury",
  permissions: ["read:Member"],
  locked: false,
  active: true,
  deletedAt: null,
};

const builtInMember: RoleDefinition = {
  ...builtInTreasury,
  id: "Member",
  name: "Miembro",
  builtInKey: "Member",
};

describe("RoleEditor deactivation", () => {
  it("offers Desactivar rol for a non-locked BUILT-IN role and states the holder count", () => {
    // Was gated on !role.builtIn, so a built-in could never be taken out of service.
    render(
      <RoleEditor
        role={builtInTreasury}
        holderCount={7}
        onSubmit={vi.fn()}
        onDelete={vi.fn().mockResolvedValue(undefined)}
      />,
    );
    expect(screen.getByRole("button", { name: "Desactivar rol" })).toBeInTheDocument();
    expect(screen.getByText(/7 miembros activos/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /eliminar rol/i })).not.toBeInTheDocument();
  });

  it("singularizes the holder count", () => {
    render(
      <RoleEditor role={builtInTreasury} holderCount={1} onSubmit={vi.fn()} onDelete={vi.fn()} />,
    );
    expect(screen.getByText(/1 miembro activo/)).toBeInTheDocument();
  });

  it("BLOCKING: never offers Desactivar rol for the Member role", () => {
    // computeMemberRoles injects Member into every claim unconditionally, so
    // deactivating it collapses nav and route access for the whole chapter.
    // firestore.rules bars it too; this mirrors that bar in the UI.
    render(
      <RoleEditor role={builtInMember} holderCount={40} onSubmit={vi.fn()} onDelete={vi.fn()} />,
    );
    expect(screen.queryByRole("button", { name: "Desactivar rol" })).not.toBeInTheDocument();
    expect(screen.getByText(/no se puede desactivar/i)).toBeInTheDocument();
  });

  it("never offers Desactivar rol on the locked Admin role", () => {
    render(
      <RoleEditor role={builtInAdmin} holderCount={0} onSubmit={vi.fn()} onDelete={vi.fn()} />,
    );
    expect(screen.queryByRole("button", { name: "Desactivar rol" })).not.toBeInTheDocument();
  });

  it("BLOCKING: never offers Desactivar rol for Admin when the doc's `locked` lags the seed", () => {
    // The documented prod-lag shape: a roles/Admin whose `locked` is false or missing.
    // firestore.rules bars deactivation on `builtInKey == 'Admin'`, INDEPENDENT of `locked`
    // (roleDeactivationAllowed()), so a mirror keyed on `locked` alone rendered the button
    // for a write the rules deny. Keyed off UNDEACTIVATABLE_BUILT_IN_KEYS, like the rules.
    render(
      <RoleEditor
        role={{ ...builtInAdmin, locked: false }}
        holderCount={3}
        onSubmit={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    expect(screen.queryByRole("button", { name: "Desactivar rol" })).not.toBeInTheDocument();
    // Editable, though: the rules `locked` conjunct reads the STORED doc, so this one's
    // perms really can be saved. Only deactivation is barred, and the copy says which.
    expect(screen.getByRole("button", { name: /guardar/i })).toBeInTheDocument();
    expect(screen.getByText(/no se puede desactivar/i)).toBeInTheDocument();
  });

  it("never offers Desactivar rol on an already-deactivated role", () => {
    // Its affordance is "Reactivar rol" in RolesPanel. roleLifecycleSafe() would permit
    // re-stamping deletedAt, so this narrowing is UI-only — and it keeps a deactivated
    // role from opening with both buttons side by side.
    render(
      <RoleEditor
        // `deletedAt` set alongside `active: false`: roleLifecycleSafe() requires
        // `deletedAt is timestamp` whenever active is false, so this is the only inactive
        // shape production can hold.
        role={{
          ...builtInTreasury,
          active: false,
          deletedAt: { seconds: 1, nanoseconds: 0 } as unknown as RoleDefinition["deletedAt"],
        }}
        holderCount={0}
        onSubmit={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    expect(screen.queryByRole("button", { name: "Desactivar rol" })).not.toBeInTheDocument();
  });

  it("BLOCKING: reports an unknown holder count instead of 0 when the members query is degraded", () => {
    // /permisos deliberately keeps the panel alive on membersError, so a null count means
    // "not loaded", not "nobody". Printing 0 understates the blast radius of a write that
    // fans out through an unbounded no-retry members scan.
    render(
      <RoleEditor
        role={builtInTreasury}
        holderCount={null}
        onSubmit={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    expect(screen.getByText(/número desconocido de miembros activos/i)).toBeInTheDocument();
    expect(screen.queryByText(/Afecta a 0 miembros activos/)).not.toBeInTheDocument();
  });

  it("BLOCKING: never offers Desactivar rol on a ghost doc (active: true + deletedAt set)", () => {
    // isLiveRole, not raw role.active: the ghost is dead to beacon's perms pipeline, so
    // RolesPanel already offers "Reactivar rol" for it. Reading role.active here put both
    // buttons on screen at once — the exact double-button the active conjunct prevents.
    const ghost: RoleDefinition = {
      ...builtInTreasury,
      active: true,
      deletedAt: { seconds: 1, nanoseconds: 0 } as unknown as RoleDefinition["deletedAt"],
    };
    render(<RoleEditor role={ghost} holderCount={0} onSubmit={vi.fn()} onDelete={vi.fn()} />);
    expect(screen.queryByRole("button", { name: "Desactivar rol" })).not.toBeInTheDocument();
  });

  it("surfaces a failed deactivation without closing the form, and logs the cause", async () => {
    // The surfaced copy cannot distinguish permission-denied from a network failure, and
    // nothing catches this globally, so the diagnostic has to reach the console
    // (guardrail #4) — same contract as RolesPanel's reactivate path.
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const onDelete = vi.fn().mockRejectedValue(new Error("permission-denied"));
    render(
      <RoleEditor role={builtInTreasury} holderCount={0} onSubmit={vi.fn()} onDelete={onDelete} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Desactivar rol" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("No se pudo desactivar el rol.");
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it("surfaces a failed save without closing the form, and logs the cause", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const onSubmit = vi.fn().mockRejectedValue(new Error("permission-denied"));
    render(
      <RoleEditor role={builtInTreasury} holderCount={0} onSubmit={onSubmit} onDelete={vi.fn()} />,
    );
    fireEvent.click(screen.getByRole("button", { name: /guardar/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent("No se pudo guardar.");
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });
});
