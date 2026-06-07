import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const requestPasswordReset = vi.fn();
vi.mock("../../../lib/auth/request-password-reset", () => ({
  requestPasswordReset: (e: string) => requestPasswordReset(e),
}));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, children }: { to: string; children: React.ReactNode }) => (
    <a href={to}>{children}</a>
  ),
}));

import { ForgotPasswordForm } from "./forgot-password-form";

describe("ForgotPasswordForm", () => {
  beforeEach(() => requestPasswordReset.mockReset());

  it("shows a generic success after sending", async () => {
    requestPasswordReset.mockResolvedValueOnce(undefined);
    render(<ForgotPasswordForm />);
    await userEvent.type(screen.getByLabelText(/correo/i), "admin@jci.bo");
    await userEvent.click(screen.getByRole("button", { name: /enviar enlace/i }));
    await waitFor(() => expect(screen.getByText(/revisa tu correo/i)).toBeInTheDocument());
    expect(requestPasswordReset).toHaveBeenCalledWith("admin@jci.bo");
  });

  it("shows the same success even when the call fails (no enumeration)", async () => {
    requestPasswordReset.mockRejectedValueOnce(new Error("nope"));
    render(<ForgotPasswordForm />);
    await userEvent.type(screen.getByLabelText(/correo/i), "ghost@jci.bo");
    await userEvent.click(screen.getByRole("button", { name: /enviar enlace/i }));
    await waitFor(() => expect(screen.getByText(/revisa tu correo/i)).toBeInTheDocument());
  });

  it("blocks an invalid email", async () => {
    render(<ForgotPasswordForm />);
    await userEvent.type(screen.getByLabelText(/correo/i), "nope");
    await userEvent.click(screen.getByRole("button", { name: /enviar enlace/i }));
    expect(await screen.findByText("Ingresa un correo válido.")).toBeInTheDocument();
    expect(requestPasswordReset).not.toHaveBeenCalled();
  });
});
