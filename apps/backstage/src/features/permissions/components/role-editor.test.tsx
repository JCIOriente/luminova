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
    const { container } = render(<RoleEditor role={null} onSubmit={onSubmit} />);

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
    render(<RoleEditor role={null} onSubmit={onSubmit} />);
    fireEvent.click(screen.getByRole("button", { name: /crear rol/i }));
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("renders the locked Admin role read-only (no save button)", () => {
    render(<RoleEditor role={builtInAdmin} onSubmit={vi.fn()} />);
    expect(screen.getByLabelText(/nombre/i)).toBeDisabled();
    expect(screen.queryByRole("button", { name: /guardar|crear/i })).not.toBeInTheDocument();
    expect(screen.getByText(/protegido/i)).toBeInTheDocument();
  });
});
