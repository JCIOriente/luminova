import { describe, expect, it } from "vitest";
import { provisionErrorMessage } from "./provision-error";

const FALLBACK = "No se pudo enviar la invitación.";

describe("provisionErrorMessage", () => {
  it("explains the console unlink when the callable reports a uid conflict", () => {
    const err = Object.assign(new Error("failed-precondition"), {
      details: { reason: "linked-to-different-login" },
    });
    expect(provisionErrorMessage(err, FALLBACK)).toBe(
      "El miembro ya está vinculado a otro acceso (correo cambiado). Desvincúlalo desde la consola antes de reintentar.",
    );
  });

  it("falls back to the generic message for any other failure", () => {
    expect(provisionErrorMessage(new Error("boom"), FALLBACK)).toBe(FALLBACK);
    expect(provisionErrorMessage(undefined, FALLBACK)).toBe(FALLBACK);
    expect(
      provisionErrorMessage(Object.assign(new Error("x"), { details: "otra cosa" }), FALLBACK),
    ).toBe(FALLBACK);
  });
});
