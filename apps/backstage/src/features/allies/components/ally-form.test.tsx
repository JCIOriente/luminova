import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Ally } from "@luminova/types";
import { AllyForm } from "./ally-form";

const ALLY: Ally = {
  id: "a1",
  companyName: "ACME",
  contactPerson: "Ana Lopez",
  phone: "70012345",
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

  it("preserves a set category when editing without touching the select", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(
      <AllyForm
        ally={{ ...ALLY, category: "University" }}
        submitLabel="Guardar"
        onSubmit={onSubmit}
        onUploadLogo={vi.fn()}
        onRemoveLogo={vi.fn()}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /guardar/i }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ category: "University" }));
  });

  it("submits valid data", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<AllyForm submitLabel="Crear" onSubmit={onSubmit} />);
    await userEvent.type(screen.getByLabelText(/empresa/i), "Acme Bolivia");
    await userEvent.type(screen.getByLabelText(/encargado/i), "Ana Pérez");
    await userEvent.type(screen.getByLabelText(/teléfono/i), "70012345");
    await userEvent.type(screen.getByLabelText(/correo/i), "contacto@acme.bo");
    await userEvent.click(screen.getByRole("button", { name: /crear/i }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        companyName: "Acme Bolivia",
        contactPerson: "Ana Pérez",
        phone: "70012345",
        email: "contacto@acme.bo",
      }),
    );
  });

  it("disables submit while the save is in flight", async () => {
    render(<AllyForm ally={ALLY} submitLabel="Guardar" onSubmit={() => new Promise(() => {})} />);
    await userEvent.click(screen.getByRole("button", { name: /guardar/i }));
    await waitFor(() => expect(screen.getByRole("button", { name: /guardando/i })).toBeDisabled());
  });

  describe("phone is capped at input time, not only on submit", () => {
    async function fillValid() {
      await userEvent.type(screen.getByLabelText(/empresa/i), "Acme Bolivia");
      await userEvent.type(screen.getByLabelText(/encargado/i), "Ana Pérez");
      await userEvent.type(screen.getByLabelText(/correo/i), "a@b.co");
    }

    it("stops typing at 8 digits and submits exactly those", async () => {
      const onSubmit = vi.fn().mockResolvedValue(undefined);
      render(<AllyForm submitLabel="Crear" onSubmit={onSubmit} />);
      await fillValid();
      const phone = screen.getByLabelText<HTMLInputElement>(/teléfono/i);
      await userEvent.type(phone, "7001234567890");
      expect(phone.value).toBe("70012345");
      await userEvent.click(screen.getByRole("button", { name: /crear/i }));
      await waitFor(() => expect(onSubmit).toHaveBeenCalled());
      expect(onSubmit.mock.calls[0]?.[0].phone).toBe("70012345");
    });

    it("caps an over-long paste at 8 digits", async () => {
      render(<AllyForm submitLabel="Crear" onSubmit={vi.fn()} />);
      const phone = screen.getByLabelText<HTMLInputElement>(/teléfono/i);
      await userEvent.click(phone);
      await userEvent.paste("7001 2345 6789");
      expect(phone.value).toBe("70012345");
    });

    it("keeps a pasted +591 number whole", async () => {
      render(<AllyForm submitLabel="Crear" onSubmit={vi.fn()} />);
      const phone = screen.getByLabelText<HTMLInputElement>(/teléfono/i);
      await userEvent.click(phone);
      await userEvent.paste("+591 700 00000");
      expect(phone.value).toBe("70000000");
    });
  });
});

describe("AllyForm validates on blur", () => {
  it("shows the company error when the user leaves the field, without submitting", async () => {
    render(<AllyForm submitLabel="Crear" onSubmit={vi.fn()} />);
    await userEvent.type(screen.getByLabelText(/^empresa/i), "AB");
    await userEvent.tab();
    expect(await screen.findByText("Mínimo 3 caracteres.")).toBeInTheDocument();
    expect(screen.getByLabelText(/^empresa/i)).toHaveAttribute("aria-invalid", "true");
  });
});
