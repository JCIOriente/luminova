import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const verifyResetCode = vi.fn();
const confirmReset = vi.fn();
vi.mock("../../../lib/auth/confirm-password-reset", () => ({
  verifyResetCode: (c: string) => verifyResetCode(c),
  confirmReset: (c: string, p: string) => confirmReset(c, p),
}));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, children }: { to: string; children: React.ReactNode }) => (
    <a href={to}>{children}</a>
  ),
}));

import { ResetPasswordForm } from "./reset-password-form";

describe("ResetPasswordForm", () => {
  beforeEach(() => {
    verifyResetCode.mockReset();
    confirmReset.mockReset();
  });

  it("shows an error for an invalid code", async () => {
    verifyResetCode.mockRejectedValueOnce(new Error("bad"));
    render(<ResetPasswordForm oobCode="bad" />);
    expect(await screen.findByText(/el enlace no es válido/i)).toBeInTheDocument();
  });

  it("confirms a new compliant password", async () => {
    verifyResetCode.mockResolvedValueOnce("admin@jci.bo");
    confirmReset.mockResolvedValueOnce(undefined);
    render(<ResetPasswordForm oobCode="good" />);
    const pw = await screen.findByLabelText("Nueva contraseña");
    await userEvent.type(pw, "Secret1");
    await userEvent.type(screen.getByLabelText("Confirmar contraseña"), "Secret1");
    await userEvent.click(screen.getByRole("button", { name: /guardar contraseña/i }));
    await waitFor(() => expect(confirmReset).toHaveBeenCalledWith("good", "Secret1"));
    expect(await screen.findByText(/contraseña actualizada/i)).toBeInTheDocument();
  });

  it("rejects mismatched passwords", async () => {
    verifyResetCode.mockResolvedValueOnce("admin@jci.bo");
    render(<ResetPasswordForm oobCode="good" />);
    const pw = await screen.findByLabelText("Nueva contraseña");
    await userEvent.type(pw, "Secret1");
    await userEvent.type(screen.getByLabelText("Confirmar contraseña"), "Secret2");
    await userEvent.click(screen.getByRole("button", { name: /guardar contraseña/i }));
    expect(await screen.findByText("Las contraseñas no coinciden.")).toBeInTheDocument();
    expect(confirmReset).not.toHaveBeenCalled();
  });
});
