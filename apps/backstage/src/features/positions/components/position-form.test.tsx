import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PositionForm } from "./position-form";

describe("PositionForm", () => {
  it("renders all fields for an Admin caller (CEL default)", () => {
    render(<PositionForm submitLabel="Crear" canEditGrants onSubmit={vi.fn()} />);
    expect(screen.getByLabelText("Cargo *")).toBeInTheDocument();
    expect(screen.getByLabelText("Variante femenina (opcional)")).toBeInTheDocument();
    expect(screen.getByLabelText("Categoría *")).toBeInTheDocument();
    expect(screen.getByLabelText("Descripción *")).toBeInTheDocument();
    expect(screen.getByLabelText("Permisos que otorga")).toBeInTheDocument();
  });

  it("hides the term input for CEL and shows it for JDL", async () => {
    render(<PositionForm submitLabel="Crear" canEditGrants onSubmit={vi.fn()} />);
    expect(screen.queryByLabelText("Gestión *")).not.toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText("Categoría *"), "JDL");
    expect(screen.getByLabelText("Gestión *")).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText("Categoría *"), "CEL");
    expect(screen.queryByLabelText("Gestión *")).not.toBeInTheDocument();
  });

  it("does not render the grants editor when canEditGrants is false", () => {
    render(<PositionForm submitLabel="Crear" canEditGrants={false} onSubmit={vi.fn()} />);
    expect(screen.queryByLabelText("Permisos que otorga")).not.toBeInTheDocument();
    expect(screen.queryByText("Permisos")).not.toBeInTheDocument();
  });

  it("renders with defaultValues of existing JDL position showing term 2025", () => {
    render(
      <PositionForm
        submitLabel="Guardar"
        canEditGrants
        defaultValues={{
          category: "JDL",
          term: 2025,
          title: "Director de Miembro Individual",
          titleFemale: "Directora de Miembro Individual",
          description: "Acompaña a los miembros individuales.",
          grants: [],
        }}
        onSubmit={vi.fn()}
      />,
    );
    const termInput = screen.getByLabelText("Gestión *") as HTMLInputElement;
    expect(termInput).toBeInTheDocument();
    expect(termInput.value).toBe("2025");
  });

  it("JDL with cleared term input shows 'Requerido.' and does not call onSubmit", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(
      <PositionForm
        submitLabel="Guardar"
        canEditGrants
        defaultValues={{
          category: "JDL",
          term: 2025,
          title: "Director de Miembro Individual",
          titleFemale: "Directora de Miembro Individual",
          description: "Acompaña a los miembros individuales.",
          grants: [],
        }}
        onSubmit={onSubmit}
      />,
    );
    const termInput = screen.getByLabelText("Gestión *");
    await userEvent.clear(termInput);
    await userEvent.click(screen.getByRole("button", { name: /guardar/i }));
    await waitFor(() => expect(screen.getByText("Requerido.")).toBeInTheDocument());
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("submits a valid comisión with term null and grants untouched", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<PositionForm submitLabel="Crear" canEditGrants={false} onSubmit={onSubmit} />);
    await userEvent.selectOptions(screen.getByLabelText("Categoría *"), "Comision");
    await userEvent.type(screen.getByLabelText("Nombre *"), "Director de Ética");
    await userEvent.type(screen.getByLabelText("Sigla *"), "CCE");
    await userEvent.type(screen.getByLabelText("Descripción *"), "Vela por el código de ética.");
    await userEvent.click(screen.getByRole("button", { name: /crear/i }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Director de Ética",
        sigla: "CCE",
        category: "Comision",
        grants: [],
        term: null,
        description: "Vela por el código de ética.",
      }),
    );
  });
});

describe("PositionForm category-aware fields", () => {
  it("CEL shows feminine variant + permisos, no sigla", () => {
    render(<PositionForm submitLabel="Crear" canEditGrants onSubmit={vi.fn(async () => {})} />);
    expect(screen.getByLabelText(/variante femenina/i)).toBeInTheDocument();
    expect(screen.getByText(/permisos que otorga/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/sigla/i)).not.toBeInTheDocument();
  });
  it("Comisión shows sigla, hides feminine variant + permisos", async () => {
    const user = userEvent.setup();
    render(<PositionForm submitLabel="Crear" canEditGrants onSubmit={vi.fn(async () => {})} />);
    await user.selectOptions(screen.getByLabelText(/categoría/i), "Comision");
    expect(screen.getByLabelText(/sigla/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/variante femenina/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/permisos que otorga/i)).not.toBeInTheDocument();
  });
  it("suggests the derived feminine as placeholder", async () => {
    const user = userEvent.setup();
    render(<PositionForm submitLabel="Crear" canEditGrants onSubmit={vi.fn(async () => {})} />);
    await user.type(screen.getByLabelText(/^cargo/i), "Director");
    expect(screen.getByLabelText(/variante femenina/i)).toHaveAttribute("placeholder", "Directora");
  });
});
