import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Position } from "@luminova/types";
import { MemberForm } from "./member-form";
import { pickDate } from "../../../test/pick-date";

const positions: Position[] = [
  {
    id: "pos-pres",
    title: "Presidente",
    titleFemale: "Presidenta",
    category: "CEL",
    grants: [],
    term: null,
    sigla: null,
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
    sigla: null,
    description: "Organiza los eventos.",
    active: true,
    deletedAt: null,
  },
  {
    id: "pos-jdl",
    title: "Director de Área",
    titleFemale: "Directora de Área",
    category: "JDL",
    grants: [],
    term: null,
    sigla: null,
    description: "Dirige un área.",
    active: true,
    deletedAt: null,
  },
];

const comisionWithSigla: Position = {
  id: "k1",
  sigla: "CCE",
  title: "Comisión de Conducta y Ética",
  titleFemale: null,
  category: "Comision",
  grants: [],
  term: null,
  description: "",
  active: true,
  deletedAt: null,
};

const inactiveCargoPosition: Position = {
  id: "pos-tesorero",
  title: "Tesorero",
  titleFemale: "Tesorera",
  category: "CEL",
  grants: [],
  term: null,
  description: "Gestiona las finanzas.",
  active: false,
  deletedAt: null,
};

describe("MemberForm", () => {
  it("blocks submit and shows an error when required fields are empty", async () => {
    const onSubmit = vi.fn();
    render(<MemberForm positions={[]} submitLabel="Crear" onSubmit={onSubmit} />);
    await userEvent.click(screen.getByRole("button", { name: /crear/i }));
    expect(await screen.findAllByText("Mínimo 3 caracteres.")).not.toHaveLength(0);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("renders the gender toggle and requires it on submit", async () => {
    const onSubmit = vi.fn();
    render(<MemberForm positions={[]} submitLabel="Crear" onSubmit={onSubmit} />);
    expect(screen.getByRole("group", { name: "Género" })).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText(/nombre/i), "Ana Pérez");
    await userEvent.type(screen.getByLabelText(/correo/i), "ana@jci.bo");
    await pickDate(/fecha de ingreso/i, "2020-03-15");
    await pickDate(/fecha de nacimiento/i, "1992-07-15");
    await userEvent.click(screen.getByRole("button", { name: /crear/i }));
    expect(await screen.findByText("Requerido.")).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("shows gendered cargo labels and excludes comisiones from the cargo options", async () => {
    render(<MemberForm positions={positions} submitLabel="Crear" onSubmit={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: "Femenino" }));
    await userEvent.click(screen.getByLabelText("Cargo"));
    expect(await screen.findByText("Presidenta")).toBeInTheDocument();
    expect(screen.queryByText("Comisión de Eventos")).not.toBeInTheDocument();
  });

  it("submits valid data with the chosen cargo and comisiones", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<MemberForm positions={positions} submitLabel="Crear" onSubmit={onSubmit} />);
    await userEvent.type(screen.getByLabelText(/nombre/i), "Ana Pérez");
    await userEvent.type(screen.getByLabelText(/correo/i), "ana@jci.bo");
    await userEvent.click(screen.getByRole("button", { name: "Femenino" }));
    await pickDate(/fecha de ingreso/i, "2020-03-15");
    await pickDate(/fecha de nacimiento/i, "1992-07-15");
    await userEvent.click(screen.getByLabelText("Cargo"));
    await userEvent.click(await screen.findByText("Directora de Área"));
    await userEvent.click(screen.getByLabelText("Comisiones (pertenece a)"));
    await userEvent.click(await screen.findByText("Comisión de Eventos"));
    await userEvent.click(screen.getByRole("button", { name: /crear/i }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Ana Pérez",
        email: "ana@jci.bo",
        gender: "Femenino",
        joinDate: "2020-03-15",
        birthdate: "1992-07-15",
        status: "Activo",
        cargoId: "pos-jdl",
        comisionIds: ["pos-eventos"],
      }),
    );
  });

  it("locks comisiones as Comité Ejecutivo Local and clears them for a CEL cargo", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<MemberForm positions={positions} submitLabel="Crear" onSubmit={onSubmit} />);
    await userEvent.type(screen.getByLabelText(/nombre/i), "Ana Pérez");
    await userEvent.type(screen.getByLabelText(/correo/i), "ana@jci.bo");
    await userEvent.click(screen.getByRole("button", { name: "Femenino" }));
    await pickDate(/fecha de ingreso/i, "2020-03-15");
    await pickDate(/fecha de nacimiento/i, "1992-07-15");
    await userEvent.click(screen.getByLabelText("Cargo"));
    await userEvent.click(await screen.findByText("Presidenta"));
    expect(screen.getByText("Comité Ejecutivo Local")).toBeInTheDocument();
    expect(screen.queryByLabelText("Comisiones (pertenece a)")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /crear/i }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ cargoId: "pos-pres", comisionIds: [] }),
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

  it("shows inactive assigned cargo with (inactivo) suffix in combobox trigger", async () => {
    render(
      <MemberForm
        positions={[...positions, inactiveCargoPosition]}
        defaultValues={{ cargoId: inactiveCargoPosition.id, gender: "Masculino" }}
        submitLabel="Guardar"
        onSubmit={vi.fn()}
      />,
    );
    expect(await screen.findByText("Tesorero (inactivo)")).toBeInTheDocument();
  });

  it("renders comisión option as 'sigla — title' when sigla is present", async () => {
    render(
      <MemberForm
        positions={[...positions, comisionWithSigla]}
        submitLabel="Crear"
        onSubmit={vi.fn()}
      />,
    );
    await userEvent.click(screen.getByLabelText("Comisiones (pertenece a)"));
    expect(await screen.findByText(/CCE — Comisión de Conducta y Ética/)).toBeInTheDocument();
  });
});
