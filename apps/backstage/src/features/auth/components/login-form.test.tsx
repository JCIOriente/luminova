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

// Anchored: the show/hide toggle is labelled "Mostrar contraseña", and the required marker
// makes the label text "Contraseña *".
const PASSWORD_LABEL = /^contraseña/i;

describe("LoginForm", () => {
  beforeEach(() => signIn.mockReset());

  it("shows a validation error for an invalid email", async () => {
    render(<LoginForm onSuccess={vi.fn()} />);
    await userEvent.type(screen.getByLabelText(/correo/i), "nope");
    await userEvent.type(screen.getByLabelText(PASSWORD_LABEL), "Secret1");
    await userEvent.click(screen.getByRole("button", { name: /entrar al portal/i }));
    expect(await screen.findByText("Ingresa un correo válido.")).toBeInTheDocument();
    expect(signIn).not.toHaveBeenCalled();
  });

  // The strength policy belongs to choosing a password (invite redeem), not to typing one
  // that already exists: a member whose password predates the policy must still get in.
  it("submits a short, policy-violating password so legacy passwords still sign in", async () => {
    signIn.mockResolvedValueOnce(undefined);
    render(<LoginForm onSuccess={vi.fn()} />);
    await userEvent.type(screen.getByLabelText(/correo/i), "admin@jci.bo");
    await userEvent.type(screen.getByLabelText(PASSWORD_LABEL), "weak");
    await userEvent.click(screen.getByRole("button", { name: /entrar al portal/i }));
    await waitFor(() => expect(signIn).toHaveBeenCalledWith("admin@jci.bo", "weak", true));
  });

  it("asks for the password when it is left empty", async () => {
    render(<LoginForm onSuccess={vi.fn()} />);
    await userEvent.type(screen.getByLabelText(/correo/i), "admin@jci.bo");
    await userEvent.click(screen.getByRole("button", { name: /entrar al portal/i }));
    expect(await screen.findByText("Ingresa tu contraseña.")).toBeInTheDocument();
    expect(signIn).not.toHaveBeenCalled();
  });

  it("marks both fields required, visibly and to assistive tech", () => {
    render(<LoginForm onSuccess={vi.fn()} />);
    expect(screen.getByLabelText(/correo/i)).toHaveAttribute("aria-required", "true");
    expect(screen.getByLabelText(PASSWORD_LABEL)).toHaveAttribute("aria-required", "true");
    expect(screen.getByText("Correo electrónico").textContent).toContain("*");
    expect(
      screen.getByText("Contraseña", { exact: false, selector: "label" }).textContent,
    ).toContain("*");
  });

  it("shows a field's error when the user leaves it, without submitting", async () => {
    render(<LoginForm onSuccess={vi.fn()} />);
    await userEvent.type(screen.getByLabelText(/correo/i), "nope");
    await userEvent.tab();
    expect(await screen.findByText("Ingresa un correo válido.")).toBeInTheDocument();
    expect(screen.getByLabelText(/correo/i)).toHaveAttribute("aria-invalid", "true");
  });

  it("focuses the first invalid field on a rejected submit", async () => {
    render(<LoginForm onSuccess={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: /entrar al portal/i }));
    await waitFor(() => expect(screen.getByLabelText(/correo/i)).toHaveFocus());
  });

  it("wires the password error to its input", async () => {
    render(<LoginForm onSuccess={vi.fn()} />);
    await userEvent.type(screen.getByLabelText(/correo/i), "admin@jci.bo");
    await userEvent.click(screen.getByRole("button", { name: /entrar al portal/i }));
    const password = screen.getByLabelText(PASSWORD_LABEL);
    await waitFor(() => expect(password).toHaveAttribute("aria-invalid", "true"));
    expect(password.getAttribute("aria-describedby")).toContain("password-err");
  });

  // Inverted: there is NO self-service recovery any more (all of it is operator-mediated), so
  // a link here would point at a page that cannot help. The copy sends them to write in, and
  // the mailto below is the real escape hatch.
  it("offers no self-service recovery link, only the operator route", () => {
    render(<LoginForm onSuccess={vi.fn()} />);
    expect(screen.queryByRole("link", { name: /la olvidaste/i })).not.toBeInTheDocument();
    expect(
      screen.getByText(/Escríbenos y te enviamos un nuevo enlace de acceso/i),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /escríbenos/i })).toHaveAttribute(
      "href",
      "mailto:jci.orienteolm@gmail.com",
    );
  });

  it("calls onSuccess after a successful sign-in (remember defaults on)", async () => {
    signIn.mockResolvedValueOnce(undefined);
    const onSuccess = vi.fn();
    render(<LoginForm onSuccess={onSuccess} />);
    await userEvent.type(screen.getByLabelText(/correo/i), "admin@jci.bo");
    await userEvent.type(screen.getByLabelText(PASSWORD_LABEL), "Secret1");
    await userEvent.click(screen.getByRole("button", { name: /entrar al portal/i }));
    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
    expect(signIn).toHaveBeenCalledWith("admin@jci.bo", "Secret1", true);
  });

  it("renders a mapped error when sign-in fails", async () => {
    signIn.mockRejectedValueOnce(new FirebaseError("auth/invalid-credential", "raw"));
    render(<LoginForm onSuccess={vi.fn()} />);
    await userEvent.type(screen.getByLabelText(/correo/i), "admin@jci.bo");
    await userEvent.type(screen.getByLabelText(PASSWORD_LABEL), "Secret1");
    await userEvent.click(screen.getByRole("button", { name: /entrar al portal/i }));
    expect(await screen.findByText("Correo o contraseña incorrectos.")).toBeInTheDocument();
  });
});
