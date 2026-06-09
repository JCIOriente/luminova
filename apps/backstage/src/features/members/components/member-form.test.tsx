import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemberForm } from "./member-form";

describe("MemberForm", () => {
  it("blocks submit and shows an error when required fields are empty", async () => {
    const onSubmit = vi.fn();
    render(<MemberForm submitLabel="Crear" onSubmit={onSubmit} />);
    await userEvent.click(screen.getByRole("button", { name: /crear/i }));
    expect(await screen.findAllByText("Mínimo 3 caracteres.")).not.toHaveLength(0);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("submits valid data with the default status", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<MemberForm submitLabel="Crear" onSubmit={onSubmit} />);
    await userEvent.type(screen.getByLabelText(/nombre/i), "Ana Pérez");
    await userEvent.type(screen.getByLabelText(/correo/i), "ana@jci.bo");
    await userEvent.type(screen.getByLabelText(/rol/i), "Presidenta");
    fireEvent.change(screen.getByLabelText(/fecha de ingreso/i), {
      target: { value: "2020-03-15" },
    });
    fireEvent.change(screen.getByLabelText(/fecha de nacimiento/i), {
      target: { value: "1992-07-01" },
    });
    await userEvent.click(screen.getByRole("button", { name: /crear/i }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Ana Pérez",
        email: "ana@jci.bo",
        role: "Presidenta",
        joinDate: "2020-03-15",
        birthdate: "1992-07-01",
        status: "Activo",
      }),
    );
  });

  it("groups fields under section headers", () => {
    render(<MemberForm submitLabel="Crear" onSubmit={async () => {}} />);
    expect(screen.getByText("Datos personales")).toBeInTheDocument();
    expect(screen.getByText("Membresía")).toBeInTheDocument();
  });

  it("renders a children slot before the submit button", () => {
    render(
      <MemberForm submitLabel="Crear" onSubmit={async () => {}}>
        <span>extra-slot</span>
      </MemberForm>,
    );
    expect(screen.getByText("extra-slot")).toBeInTheDocument();
  });
});
