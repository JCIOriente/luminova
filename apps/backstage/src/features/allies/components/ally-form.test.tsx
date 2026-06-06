import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AllyForm } from "./ally-form";

describe("AllyForm", () => {
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
