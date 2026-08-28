import { describe, expect, it } from "vitest";
import { PROVISION_BLOCK_REASONS, type ProvisionBlockReason } from "@luminova/types";
import { provisionErrorMessage } from "./provision-error";

const FALLBACK = "No se pudo enviar la invitación.";

const withReason = (reason: unknown) =>
  Object.assign(new Error("failed-precondition"), { details: { reason } });

/** Typed narrowing of `withReason` for the real tags: a reason renamed in beacon fails to
 *  compile here too, instead of quietly asserting a message nothing throws any more. */
const blocked = (reason: ProvisionBlockReason) => withReason(reason);

describe("provisionErrorMessage", () => {
  it("explains the console unlink when the callable reports a uid conflict", () => {
    expect(provisionErrorMessage(blocked("linked-to-different-login"), FALLBACK)).toBe(
      "El miembro ya está vinculado a otro acceso (correo cambiado). Desvincúlalo desde la consola antes de reintentar.",
    );
  });

  // The three non-Admin refusals. provisionBlockedForNonAdmin sees the member DOC, not the
  // Auth directory, so a delegate still reaches these — and without a message each reads as a
  // transient failure the operator retries forever.
  it("names beacon's adoption refusal (reprovision-requires-admin)", () => {
    expect(provisionErrorMessage(blocked("reprovision-requires-admin"), FALLBACK)).toBe(
      "Ya existe un acceso para este correo. Pídele a un administrador que lo reenvíe o lo vincule.",
    );
  });

  it("names beacon's direct-grants refusal (granted-member-requires-admin)", () => {
    expect(provisionErrorMessage(blocked("granted-member-requires-admin"), FALLBACK)).toBe(
      "Este miembro tiene roles o permisos asignados: solo un administrador puede crear su acceso.",
    );
  });

  it("names beacon's power-seat refusal (power-seat-requires-admin)", () => {
    expect(provisionErrorMessage(blocked("power-seat-requires-admin"), FALLBACK)).toBe(
      "El cargo de este miembro otorga permisos: solo un administrador puede crear su acceso.",
    );
  });

  it("names the malformed stored email, which no retry can fix", () => {
    expect(provisionErrorMessage(blocked("member-email-malformed"), FALLBACK)).toBe(
      "El correo guardado de este miembro no es válido. Corrígelo en su ficha antes de crear su acceso.",
    );
  });

  it("gives EVERY reason beacon can throw a distinct message", () => {
    // Iterates the shared union rather than re-listing the literals: a reason added in beacon
    // and not given a message here fails this test (it falls back), and a copy-paste that
    // leaves two reasons sharing a message — telling the operator to do the wrong thing about
    // half the time — fails it too.
    const messages = PROVISION_BLOCK_REASONS.map((reason) =>
      provisionErrorMessage(blocked(reason), FALLBACK),
    );
    expect(messages).toHaveLength(PROVISION_BLOCK_REASONS.length);
    expect(messages).not.toContain(FALLBACK);
    expect(new Set(messages).size).toBe(messages.length);
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
    // Inherited Object.prototype keys must not resolve to a function-as-message.
    expect(provisionErrorMessage(withReason("toString"), FALLBACK)).toBe(FALLBACK);
    expect(provisionErrorMessage(withReason("constructor"), FALLBACK)).toBe(FALLBACK);
  });
});
