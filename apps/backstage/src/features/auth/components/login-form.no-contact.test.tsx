import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

// A chapter whose brand.toml has no [backstage] contactEmail and a blank [contact] email (D11).
vi.mock("virtual:luminova-brand", async (importOriginal) => ({
  ...(await importOriginal<typeof import("virtual:luminova-brand")>()),
  contactEmail: "",
}));
vi.mock("../../../lib/auth/sign-in", () => ({ signIn: vi.fn() }));

import { LoginForm } from "./login-form";

describe("LoginForm without a contact email", () => {
  it("shows no mailto link, and keeps the sentence that needs none", () => {
    render(<LoginForm onSuccess={vi.fn()} />);
    expect(screen.queryByRole("link", { name: /escríbenos/i })).not.toBeInTheDocument();
    expect(document.querySelector('a[href^="mailto:"]')).toBeNull();
    expect(
      screen.getByText("¿Aún no tienes cuenta? Te la creamos al unirte al capítulo."),
    ).toBeInTheDocument();
  });
});
