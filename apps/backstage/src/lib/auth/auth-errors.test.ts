import { describe, it, expect } from "vitest";
import { FirebaseError } from "firebase/app";
import { authErrorMessage } from "./auth-errors";

describe("authErrorMessage", () => {
  it("maps invalid-credential to a Spanish message", () => {
    const err = new FirebaseError("auth/invalid-credential", "raw");
    expect(authErrorMessage(err)).toBe("Correo o contraseña incorrectos.");
  });

  it("maps too-many-requests", () => {
    const err = new FirebaseError("auth/too-many-requests", "raw");
    expect(authErrorMessage(err)).toBe(
      "Demasiados intentos. Espera un momento e intenta de nuevo.",
    );
  });

  it("falls back to a generic message for unknown codes", () => {
    const err = new FirebaseError("auth/some-new-code", "raw");
    expect(authErrorMessage(err)).toBe("No se pudo iniciar sesión. Intenta de nuevo.");
  });

  it("falls back to generic for non-Firebase errors", () => {
    expect(authErrorMessage(new Error("boom"))).toBe(
      "No se pudo iniciar sesión. Intenta de nuevo.",
    );
  });
});
