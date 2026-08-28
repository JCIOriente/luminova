import { describe, expect, it } from "vitest";
import { provisionErrorMessage } from "./provision-error";

const FALLBACK = "No se pudo enviar la invitación.";

const withReason = (reason: unknown) =>
  Object.assign(new Error("failed-precondition"), { details: { reason } });

describe("provisionErrorMessage", () => {
  it("explains the console unlink when the callable reports a uid conflict", () => {
    expect(provisionErrorMessage(withReason("linked-to-different-login"), FALLBACK)).toBe(
      "El miembro ya está vinculado a otro acceso (correo cambiado). Desvincúlalo desde la consola antes de reintentar.",
    );
  });

  // The three non-Admin refusals. provisionBlockedForNonAdmin sees the member DOC, not the
  // Auth directory, so a delegate still reaches these — and without a message each reads as a
  // transient failure the operator retries forever.
  it("names beacon's adoption refusal (reprovision-requires-admin)", () => {
    expect(provisionErrorMessage(withReason("reprovision-requires-admin"), FALLBACK)).toBe(
      "Ya existe un acceso para este correo. Pídele a un administrador que lo reenvíe o lo vincule.",
    );
  });

  it("names beacon's direct-grants refusal (granted-member-requires-admin)", () => {
    expect(provisionErrorMessage(withReason("granted-member-requires-admin"), FALLBACK)).toBe(
      "Este miembro tiene roles o permisos asignados: solo un administrador puede crear su acceso.",
    );
  });

  it("names beacon's power-seat refusal (power-seat-requires-admin)", () => {
    expect(provisionErrorMessage(withReason("power-seat-requires-admin"), FALLBACK)).toBe(
      "El cargo de este miembro otorga permisos: solo un administrador puede crear su acceso.",
    );
  });

  it("gives each reason a DISTINCT message", () => {
    // A table is one copy-paste away from two reasons sharing a message, which would tell the
    // operator to do the wrong thing about half the time.
    const messages = [
      "linked-to-different-login",
      "reprovision-requires-admin",
      "granted-member-requires-admin",
      "power-seat-requires-admin",
    ].map((reason) => provisionErrorMessage(withReason(reason), FALLBACK));
    expect(new Set(messages).size).toBe(messages.length);
    expect(messages).not.toContain(FALLBACK);
  });

  it("falls back to the generic message for any other failure", () => {
    expect(provisionErrorMessage(new Error("boom"), FALLBACK)).toBe(FALLBACK);
    expect(provisionErrorMessage(undefined, FALLBACK)).toBe(FALLBACK);
    expect(provisionErrorMessage(null, FALLBACK)).toBe(FALLBACK);
    expect(
      provisionErrorMessage(Object.assign(new Error("x"), { details: "otra cosa" }), FALLBACK),
    ).toBe(FALLBACK);
    // An unknown code, and a non-string reason: neither may index the table.
    expect(provisionErrorMessage(withReason("no-such-reason"), FALLBACK)).toBe(FALLBACK);
    expect(provisionErrorMessage(withReason(42), FALLBACK)).toBe(FALLBACK);
    expect(provisionErrorMessage(withReason(undefined), FALLBACK)).toBe(FALLBACK);
  });
});
