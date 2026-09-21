import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FirebaseError } from "firebase/app";

const signIn = vi.fn();
vi.mock("../../../lib/auth/sign-in", () => ({
  signIn: (e: string, p: string, r: boolean) => signIn(e, p, r),
}));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, children, ...rest }: { to: string; children: React.ReactNode }) => (
    <a href={to} {...rest}>
      {children}
    </a>
  ),
}));

import { LoginForm } from "./login-form";

describe("LoginForm", () => {
  beforeEach(() => signIn.mockReset());

  it("shows a validation error for an invalid email", async () => {
    render(<LoginForm onSuccess={vi.fn()} />);
    await userEvent.type(screen.getByLabelText(/correo/i), "nope");
    await userEvent.type(screen.getByLabelText("Contraseña"), "Secret1");
    await userEvent.click(screen.getByRole("button", { name: /entrar a backstage/i }));
    expect(await screen.findByText("Ingresa un correo válido.")).toBeInTheDocument();
    expect(signIn).not.toHaveBeenCalled();
  });

  it("blocks submit for a password that violates the policy", async () => {
    render(<LoginForm onSuccess={vi.fn()} />);
    await userEvent.type(screen.getByLabelText(/correo/i), "admin@jci.bo");
    await userEvent.type(screen.getByLabelText("Contraseña"), "weak");
    await userEvent.click(screen.getByRole("button", { name: /entrar a backstage/i }));
    expect(await screen.findByText(/la contraseña necesita/i)).toBeInTheDocument();
    expect(signIn).not.toHaveBeenCalled();
  });

  // Inverted: there is NO self-service recovery any more (all of it is operator-mediated), so
  // a link here would point at a page that cannot help. The copy sends them to the directiva,
  // and the CEL mailto below is the real escape hatch.
  it("offers no self-service recovery link, only the operator route", () => {
    render(<LoginForm onSuccess={vi.fn()} />);
    expect(screen.queryByRole("link", { name: /la olvidaste/i })).not.toBeInTheDocument();
    expect(
      screen.getByText(/Pídele a la directiva que te envíe un enlace de acceso/i),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /escríbele al cel/i })).toHaveAttribute(
      "href",
      "mailto:jci.orienteolm@gmail.com",
    );
  });

  it("calls onSuccess after a successful sign-in (remember defaults on)", async () => {
    signIn.mockResolvedValueOnce(undefined);
    const onSuccess = vi.fn();
    render(<LoginForm onSuccess={onSuccess} />);
    await userEvent.type(screen.getByLabelText(/correo/i), "admin@jci.bo");
    await userEvent.type(screen.getByLabelText("Contraseña"), "Secret1");
    await userEvent.click(screen.getByRole("button", { name: /entrar a backstage/i }));
    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
    expect(signIn).toHaveBeenCalledWith("admin@jci.bo", "Secret1", true);
  });

  it("renders a mapped error when sign-in fails", async () => {
    signIn.mockRejectedValueOnce(new FirebaseError("auth/invalid-credential", "raw"));
    render(<LoginForm onSuccess={vi.fn()} />);
    await userEvent.type(screen.getByLabelText(/correo/i), "admin@jci.bo");
    await userEvent.type(screen.getByLabelText("Contraseña"), "Secret1");
    await userEvent.click(screen.getByRole("button", { name: /entrar a backstage/i }));
    expect(await screen.findByText("Correo o contraseña incorrectos.")).toBeInTheDocument();
  });
});
