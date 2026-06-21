import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Ally } from "@luminova/types";
import { AllyForm } from "./ally-form";

const ALLY: Ally = {
  id: "a1",
  companyName: "ACME",
  contactPerson: "Ana Lopez",
  phone: "1",
  email: "a@b.co",
  logoUrl: null,
  category: null,
  active: true,
  deletedAt: null,
};

describe("AllyForm", () => {
  it("renders the category select", () => {
    render(<AllyForm submitLabel="Crear" onSubmit={vi.fn()} />);
    expect(screen.getByLabelText(/categoría/i)).toBeInTheDocument();
  });

  it("shows the logo uploader only when editing an existing ally", () => {
    const { rerender } = render(<AllyForm submitLabel="Crear" onSubmit={vi.fn()} />);
    expect(screen.queryByLabelText(/^logo$/i)).not.toBeInTheDocument();
    rerender(
      <AllyForm
        ally={ALLY}
        submitLabel="Guardar"
        onSubmit={vi.fn()}
        onUploadLogo={vi.fn()}
        onRemoveLogo={vi.fn()}
      />,
    );
    expect(screen.getByLabelText(/^logo$/i)).toBeInTheDocument();
  });

  it("blocks submit and shows an error when required fields are empty", async () => {
    const onSubmit = vi.fn();
    render(<AllyForm submitLabel="Crear" onSubmit={onSubmit} />);
    await userEvent.click(screen.getByRole("button", { name: /crear/i }));
    expect(await screen.findAllByText("Mínimo 3 caracteres.")).not.toHaveLength(0);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("rejects an invalid email", async () => {
    const onSubmit = vi.fn();
    render(<AllyForm submitLabel="Crear" onSubmit={onSubmit} />);
    await userEvent.type(screen.getByLabelText(/empresa/i), "Acme Bolivia");
    await userEvent.type(screen.getByLabelText(/encargado/i), "Ana Pérez");
    await userEvent.type(screen.getByLabelText(/teléfono/i), "777");
    await userEvent.type(screen.getByLabelText(/correo/i), "nope");
    await userEvent.click(screen.getByRole("button", { name: /crear/i }));
    expect(await screen.findByText("Correo inválido.")).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("submits valid data", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<AllyForm submitLabel="Crear" onSubmit={onSubmit} />);
    await userEvent.type(screen.getByLabelText(/empresa/i), "Acme Bolivia");
    await userEvent.type(screen.getByLabelText(/encargado/i), "Ana Pérez");
    await userEvent.type(screen.getByLabelText(/teléfono/i), "777");
    await userEvent.type(screen.getByLabelText(/correo/i), "contacto@acme.bo");
    await userEvent.click(screen.getByRole("button", { name: /crear/i }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        companyName: "Acme Bolivia",
        contactPerson: "Ana Pérez",
        phone: "777",
        email: "contacto@acme.bo",
      }),
    );
  });
});
