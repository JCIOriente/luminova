import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Position } from "@luminova/types";
import { MemberForm } from "./member-form";

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

describe("MemberForm", () => {
  it("blocks submit and shows an error when required fields are empty", async () => {
    const onSubmit = vi.fn();
    render(<MemberForm positions={[]} submitLabel="Crear" onSubmit={onSubmit} />);
    await userEvent.click(screen.getByRole("button", { name: /crear/i }));
    expect(await screen.findAllByText("Mínimo 3 caracteres.")).not.toHaveLength(0);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("renders the gender select and requires it on submit", async () => {
    const onSubmit = vi.fn();
    render(<MemberForm positions={[]} submitLabel="Crear" onSubmit={onSubmit} />);
    expect(screen.getByLabelText("Género *")).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText(/nombre/i), "Ana Pérez");
    await userEvent.type(screen.getByLabelText(/correo/i), "ana@jci.bo");
    fireEvent.change(screen.getByLabelText(/fecha de ingreso/i), {
      target: { value: "2020-03-15" },
    });
    fireEvent.change(screen.getByLabelText(/fecha de nacimiento/i), {
      target: { value: "1992-07-01" },
    });
    await userEvent.click(screen.getByRole("button", { name: /crear/i }));
    expect(await screen.findByText("Requerido.")).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("shows gendered cargo labels and excludes comisiones from the cargo options", async () => {
    render(<MemberForm positions={positions} submitLabel="Crear" onSubmit={vi.fn()} />);
    await userEvent.selectOptions(screen.getByLabelText("Género *"), "Femenino");
    await userEvent.click(screen.getByLabelText("Cargo"));
    expect(await screen.findByText("Presidenta")).toBeInTheDocument();
    expect(screen.queryByText("Comisión de Eventos")).not.toBeInTheDocument();
  });

  it("submits valid data with the chosen cargo and comisiones", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<MemberForm positions={positions} submitLabel="Crear" onSubmit={onSubmit} />);
    await userEvent.type(screen.getByLabelText(/nombre/i), "Ana Pérez");
    await userEvent.type(screen.getByLabelText(/correo/i), "ana@jci.bo");
    await userEvent.selectOptions(screen.getByLabelText("Género *"), "Femenino");
    fireEvent.change(screen.getByLabelText(/fecha de ingreso/i), {
      target: { value: "2020-03-15" },
    });
    fireEvent.change(screen.getByLabelText(/fecha de nacimiento/i), {
      target: { value: "1992-07-01" },
    });
    await userEvent.click(screen.getByLabelText("Cargo"));
    await userEvent.click(await screen.findByText("Presidenta"));
    await userEvent.click(screen.getByLabelText("Comisiones"));
    await userEvent.click(await screen.findByText("Comisión de Eventos"));
    await userEvent.click(screen.getByRole("button", { name: /crear/i }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Ana Pérez",
        email: "ana@jci.bo",
        gender: "Femenino",
        joinDate: "2020-03-15",
        birthdate: "1992-07-01",
        status: "Activo",
        cargoId: "pos-pres",
        comisionIds: ["pos-eventos"],
      }),
    );
  });

  it("groups fields under section headers", () => {
    render(<MemberForm positions={[]} submitLabel="Crear" onSubmit={async () => {}} />);
    expect(screen.getByText("Datos personales")).toBeInTheDocument();
    expect(screen.getByText("Membresía")).toBeInTheDocument();
  });

  it("renders a children slot before the submit button", () => {
    render(
      <MemberForm positions={[]} submitLabel="Crear" onSubmit={async () => {}}>
        <span>extra-slot</span>
      </MemberForm>,
    );
    expect(screen.getByText("extra-slot")).toBeInTheDocument();
  });
});
