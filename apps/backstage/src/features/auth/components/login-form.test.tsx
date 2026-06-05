import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FirebaseError } from "firebase/app";

const signIn = vi.fn();
vi.mock("../../../lib/auth/sign-in", () => ({ signIn: (e: string, p: string) => signIn(e, p) }));

import { LoginForm } from "./login-form";

describe("LoginForm", () => {
  beforeEach(() => signIn.mockReset());

  it("shows a validation error for an invalid email", async () => {
    render(<LoginForm onSuccess={vi.fn()} />);
    await userEvent.type(screen.getByLabelText(/correo/i), "nope");
    await userEvent.type(screen.getByLabelText(/contraseña/i), "secret");
    await userEvent.click(screen.getByRole("button", { name: /iniciar sesión/i }));
    expect(await screen.findByText("Ingresa un correo válido.")).toBeInTheDocument();
    expect(signIn).not.toHaveBeenCalled();
  });

  it("calls onSuccess after a successful sign-in", async () => {
    signIn.mockResolvedValueOnce(undefined);
    const onSuccess = vi.fn();
    render(<LoginForm onSuccess={onSuccess} />);
    await userEvent.type(screen.getByLabelText(/correo/i), "admin@jci.bo");
    await userEvent.type(screen.getByLabelText(/contraseña/i), "secret");
    await userEvent.click(screen.getByRole("button", { name: /iniciar sesión/i }));
    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
    expect(signIn).toHaveBeenCalledWith("admin@jci.bo", "secret");
  });

  it("renders a mapped error when sign-in fails", async () => {
    signIn.mockRejectedValueOnce(new FirebaseError("auth/invalid-credential", "raw"));
    render(<LoginForm onSuccess={vi.fn()} />);
    await userEvent.type(screen.getByLabelText(/correo/i), "admin@jci.bo");
    await userEvent.type(screen.getByLabelText(/contraseña/i), "wrong");
    await userEvent.click(screen.getByRole("button", { name: /iniciar sesión/i }));
    expect(await screen.findByText("Correo o contraseña incorrectos.")).toBeInTheDocument();
  });
});
