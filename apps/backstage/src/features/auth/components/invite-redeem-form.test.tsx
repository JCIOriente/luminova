import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { INVITE_RETRY_AFTER_SECONDS } from "@luminova/types";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { describeCallable, redeemCallable } = vi.hoisted(() => ({
  describeCallable: vi.fn(),
  redeemCallable: vi.fn(),
}));
vi.mock("firebase/functions", () => ({
  httpsCallable: (_svc: unknown, name: string) =>
    name === "describeInvite" ? describeCallable : redeemCallable,
}));
vi.mock("@luminova/firebase/functions", () => ({ getFunctionsService: () => ({}) }));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
}));

import { InviteRedeemForm } from "./invite-redeem-form";

const VALID = { email: "ana@jci.bo", name: "Ana Pérez", expiresAt: Date.now() + 86_400_000 };

function refusal(reason: string) {
  return Object.assign(new Error("refused"), { details: { reason } });
}

/** Any live alert whose text matches. Three call sites wanted the same four lines — RTL has
 *  no "some alert says this" query, and the page can show more than one at once. */
function hasAlertMatching(pattern: RegExp) {
  return screen.getAllByRole("alert").some((a) => pattern.test(a.textContent ?? ""));
}

async function fillPasswords(password: string, confirm = password) {
  await userEvent.type(screen.getByLabelText("Nueva contraseña"), password);
  await userEvent.type(screen.getByLabelText("Confirmar contraseña"), confirm);
}

describe("InviteRedeemForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    describeCallable.mockResolvedValue({ data: VALID });
    redeemCallable.mockResolvedValue({ data: { ok: true, email: VALID.email } });
  });

  // Guardrail #3, explicitly: loading / error / valid are three states, and this page has a
  // genuine fetch, so a `!data` gate would render an infinite skeleton on every refusal.
  it("shows a LOADING state while the token is being validated", () => {
    describeCallable.mockReturnValue(new Promise(() => {}));
    render(<InviteRedeemForm token="abc" />);
    expect(screen.getByText(/Validando el enlace/i)).toBeInTheDocument();
  });

  it("shows the invitee's name and FULL unmasked address once valid", async () => {
    // Unmasked deliberately: the token holder is the intended recipient, and the address is
    // how they confirm the operator sent the right link. Masking protects nobody who could
    // simply redeem it.
    render(<InviteRedeemForm token="abc" />);
    expect(await screen.findByText(/Ana Pérez/)).toBeInTheDocument();
    expect(screen.getByText("ana@jci.bo")).toBeInTheDocument();
  });

  it("refuses an EMPTY token without calling the callable", async () => {
    // A bare /invitacion with no fragment — a truncated paste, or someone typing the path.
    render(<InviteRedeemForm token="" />);
    expect(await screen.findByRole("alert")).toHaveTextContent(/enlace/i);
    expect(describeCallable).not.toHaveBeenCalled();
  });

  it.each([
    ["invite-expired", /ya venció/i],
    ["invite-used", /ya se usó/i],
    ["invite-revoked", /más reciente/i],
    ["invite-member-now-privileged", /administrador/i],
    ["invite-account-disabled", /deshabilitada/i],
    ["invite-invalid", /ya no es válido/i],
  ])("explains %s in its own words", async (reason, pattern) => {
    describeCallable.mockRejectedValue(refusal(reason));
    render(<InviteRedeemForm token="abc" />);
    expect(await screen.findByRole("alert")).toHaveTextContent(pattern);
    // A dead link must not also offer the form.
    expect(screen.queryByLabelText("Nueva contraseña")).not.toBeInTheDocument();
  });

  it("offers a RETRY for an untagged failure", async () => {
    // A network blip is worth retrying, and without a retry the invitee's only recourse on a
    // transient error is to ask for a whole new link.
    describeCallable.mockRejectedValue(new Error("network"));
    render(<InviteRedeemForm token="abc" />);
    expect(await screen.findByRole("button", { name: /reintentar/i })).toBeInTheDocument();
  });

  it("re-validates when the retry is pressed", async () => {
    describeCallable.mockRejectedValueOnce(new Error("network"));
    render(<InviteRedeemForm token="abc" />);
    await userEvent.click(await screen.findByRole("button", { name: /reintentar/i }));
    expect(await screen.findByText("ana@jci.bo")).toBeInTheDocument();
  });

  it("does NOT offer a retry for a deliberate refusal", async () => {
    // "ya se usó" is permanent for this token; a retry button there is a dead end that invites
    // the invitee to hammer an unauthenticated endpoint.
    describeCallable.mockRejectedValue(refusal("invite-used"));
    render(<InviteRedeemForm token="def" />);
    await waitFor(() => expect(screen.getAllByRole("alert").length).toBeGreaterThan(0));
    expect(screen.queryByRole("button", { name: /reintentar/i })).not.toBeInTheDocument();
  });

  // BLOCKING: the guard the component this replaced already had, and which the rewrite must
  // not lose. Without it a resolved-but-stale describeInvite overwrites a newer phase —
  // reachable on every mount under StrictMode's double-invoke, and on any token change.
  it("BLOCKING: a stale describeInvite response never overwrites a newer one", async () => {
    let resolveFirst: (v: unknown) => void = () => {};
    describeCallable.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveFirst = resolve;
      }),
    );
    describeCallable.mockResolvedValueOnce({
      data: { ...VALID, name: "Segunda Persona", email: "segunda@jci.bo" },
    });

    const { rerender } = render(<InviteRedeemForm token="first" />);
    rerender(<InviteRedeemForm token="second" />);
    expect(await screen.findByText("segunda@jci.bo")).toBeInTheDocument();

    // The first request lands LAST. It must be ignored, not rendered over the second.
    resolveFirst({ data: { ...VALID, name: "Primera Persona", email: "primera@jci.bo" } });
    await waitFor(() => expect(screen.getByText("segunda@jci.bo")).toBeInTheDocument());
    expect(screen.queryByText("primera@jci.bo")).not.toBeInTheDocument();
  });

  it("never calls redeemInvite for a password the policy rejects", async () => {
    // The policy is enforced server-side too, but a round-trip that burns nothing and tells
    // the invitee something the checklist already shows is pure latency.
    render(<InviteRedeemForm token="abc" />);
    await screen.findByLabelText("Nueva contraseña");
    await fillPasswords("weak");
    await userEvent.click(screen.getByRole("button", { name: /crear contraseña/i }));
    await waitFor(() => expect(screen.getAllByRole("alert").length).toBeGreaterThan(0));
    expect(redeemCallable).not.toHaveBeenCalled();
  });

  it("refuses mismatched confirmations", async () => {
    render(<InviteRedeemForm token="abc" />);
    await screen.findByLabelText("Nueva contraseña");
    await fillPasswords("Abcde1", "Abcde2");
    await userEvent.click(screen.getByRole("button", { name: /crear contraseña/i }));
    expect(await screen.findByText(/no coinciden/i)).toBeInTheDocument();
    expect(redeemCallable).not.toHaveBeenCalled();
  });

  it("redeems and confirms, with a way to sign in", async () => {
    render(<InviteRedeemForm token="abc" />);
    await screen.findByLabelText("Nueva contraseña");
    await fillPasswords("Abcde1");
    await userEvent.click(screen.getByRole("button", { name: /crear contraseña/i }));
    expect(await screen.findByText(/Contraseña creada/i)).toBeInTheDocument();
    expect(redeemCallable).toHaveBeenCalledWith({ token: "abc", password: "Abcde1" });
    // NOT auto-signed-in: they land on /login and authenticate with what they just chose.
    expect(screen.getByRole("link", { name: /iniciar sesión/i })).toHaveAttribute("href", "/login");
  });

  it("clears the token from the URL after a successful redemption", async () => {
    // A spent credential must not linger in the address bar or the history entry on what may
    // be a shared device.
    const replaceState = vi.spyOn(window.history, "replaceState");
    render(<InviteRedeemForm token="abc" />);
    await screen.findByLabelText("Nueva contraseña");
    await fillPasswords("Abcde1");
    await userEvent.click(screen.getByRole("button", { name: /crear contraseña/i }));
    await screen.findByText(/Contraseña creada/i);
    expect(replaceState).toHaveBeenCalled();
    replaceState.mockRestore();
  });

  it("BLOCKING: the success screen survives the router clearing the token", async () => {
    // The bug this pins was invisible to every other test in this file, because they all pass
    // `token` as a STATIC prop while the real page feeds it from
    // useLocation({ select: l => l.hash }).
    //
    // window.history.replaceState is not inert: @tanstack/history monkey-patches it and calls
    // onPushPop("REPLACE"), so the router's location updates and the route re-renders this
    // component with token="". The rerender below is that, reproduced. Without the `settled`
    // guard the load effect re-fires, takes the `token.length === 0` branch, and replaces
    // "Contraseña creada" with "este enlace está incompleto" — for someone whose password was
    // just created successfully, on the only onboarding path there is.
    const { rerender } = render(<InviteRedeemForm token="abc" />);
    await screen.findByLabelText("Nueva contraseña");
    await fillPasswords("Abcde1");
    await userEvent.click(screen.getByRole("button", { name: /crear contraseña/i }));
    await screen.findByText(/Contraseña creada/i);

    rerender(<InviteRedeemForm token="" />);

    expect(screen.getByText(/Contraseña creada/i)).toBeInTheDocument();
    expect(screen.queryByText(/incompleto/i)).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /iniciar sesión/i })).toHaveAttribute("href", "/login");
  });

  it("keeps the form usable when redemption fails for a retryable reason", async () => {
    redeemCallable.mockRejectedValue(new Error("network"));
    render(<InviteRedeemForm token="abc" />);
    await screen.findByLabelText("Nueva contraseña");
    await fillPasswords("Abcde1");
    await userEvent.click(screen.getByRole("button", { name: /crear contraseña/i }));
    await waitFor(() => expect(screen.getAllByRole("alert").length).toBeGreaterThan(0));
    expect(screen.getByLabelText("Nueva contraseña")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /crear contraseña/i })).toBeEnabled();
  });

  it("WITHHOLDS the submit button after a THROTTLED redemption, not just the load retry", async () => {
    // The regression this pins. The submit path read only the refusal's message and dropped
    // its `retryAfterSeconds`, so the button stayed live under copy promising a wait — and
    // this is the button an invitee retries hardest, because it sits behind a password they
    // have already typed. Each impatient click spends an ENDPOINT-WIDE slot to fail, and that
    // bucket has shared fate: the clicks push the very ceiling that denies every OTHER
    // invitee. The load path got this treatment; the submit path is where it matters more.
    redeemCallable.mockRejectedValue(refusal("invite-too-many-attempts"));
    render(<InviteRedeemForm token="abc" />);
    await screen.findByLabelText("Nueva contraseña");
    await fillPasswords("Abcde1");
    await userEvent.click(screen.getByRole("button", { name: /crear contraseña/i }));

    // `/espera \d+s/`, not the literal starting value: the countdown ticks on a real 1 s
    // timer, so asserting `espera 12s` would race it — one tick and that regex can never
    // match again, which flakes on a loaded runner. The starting figure is pinned against the
    // shared constant in invite-error.test.ts; what belongs HERE is that a wait is shown at
    // all and that the button is withheld while it runs.
    const waiting = await screen.findByRole("button", { name: /espera \d+s/i });
    expect(waiting).toBeDisabled();
    expect(Number(/espera (\d+)s/i.exec(waiting.textContent ?? "")?.[1])).toBeLessThanOrEqual(
      INVITE_RETRY_AFTER_SECONDS,
    );
    expect(hasAlertMatching(/Demasiados intentos/i)).toBe(true);
  });

  it("does NOT carry a throttled wait over to a newly pasted link", async () => {
    // `cooldown` gained a second writer when the submit path started honouring
    // `retryAfterSeconds`, and both buckets are keyed PER TOKEN — so a wait one link earned
    // must not disable the submit button for the next one. Reachable in one tab: invitacion.tsx
    // feeds `token` from the location hash, so pasting a second link re-runs load() with a
    // countdown still ticking from the first.
    redeemCallable.mockRejectedValueOnce(refusal("invite-too-many-attempts"));
    const { rerender } = render(<InviteRedeemForm token="first" />);
    await screen.findByLabelText("Nueva contraseña");
    await fillPasswords("Abcde1");
    await userEvent.click(screen.getByRole("button", { name: /crear contraseña/i }));
    await screen.findByRole("button", { name: /espera \d+s/i });

    rerender(<InviteRedeemForm token="second" />);

    // The new link's own redeem bucket is untouched; its button must be live immediately.
    expect(await screen.findByRole("button", { name: /crear contraseña/i })).toBeEnabled();
  });

  it("names the blocked security check when the SUBMIT call fails attestation", async () => {
    // The submit path must surface the attestation branch too, not fall back to "no pudimos
    // guardar tu contraseña" — which would hide the real cause at the very last step. This is
    // the assertion that used to sit in invite-error.test.ts against the message-only wrapper;
    // once both paths read `inviteRefusal`, only the component can still tell them apart.
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      redeemCallable.mockRejectedValue({ code: "functions/unauthenticated" });
      render(<InviteRedeemForm token="abc" />);
      await screen.findByLabelText("Nueva contraseña");
      await fillPasswords("Abcde1");
      await userEvent.click(screen.getByRole("button", { name: /crear contraseña/i }));
      await waitFor(() => expect(hasAlertMatching(/verificaci[óo]n de seguridad/i)).toBe(true));
      // On the BASE branch this button stayed live, because attestation failure was treated
      // as permanent. Enforcement adds two causes a retry does clear (a transient reCAPTCHA
      // failure, and the owner fixing the registration while the invitee is still on the
      // page), so the refusal now carries ATTESTATION_RETRY_AFTER_SECONDS and the button is
      // withheld for it — the same treatment a throttled submit gets, for a different reason.
      const waiting = await screen.findByRole("button", { name: /espera \d+s/i });
      expect(waiting).toBeDisabled();
    } finally {
      consoleError.mockRestore();
    }
  });

  it("names a TAGGED redemption failure instead of a generic one", async () => {
    // invite-update-failed in particular: the token is spent and the password was never set,
    // so "inténtalo de nuevo" would be a lie.
    redeemCallable.mockRejectedValue(refusal("invite-update-failed"));
    render(<InviteRedeemForm token="abc" />);
    await screen.findByLabelText("Nueva contraseña");
    await fillPasswords("Abcde1");
    await userEvent.click(screen.getByRole("button", { name: /crear contraseña/i }));
    await waitFor(() => expect(hasAlertMatching(/ya se consumió/i)).toBe(true));
  });
});

describe("InviteRedeemForm — the reload a blocked attestation needs", () => {
  // `inviteRefusal` now names `retry-or-reload` on an App Check rejection instead of hiding a
  // "recarga la página" sentence in the Spanish copy. Which affordance the invitee gets is
  // THIS component's decision, because only it knows what a reload costs on the path it is
  // rendering — and the two paths differ.
  const attestationFailure = { code: "functions/unauthenticated" };
  let reload: ReturnType<typeof vi.fn>;
  let consoleError: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    describeCallable.mockResolvedValue({ data: VALID });
    redeemCallable.mockResolvedValue({ data: { ok: true, email: VALID.email } });
    reload = vi.fn();
    vi.stubGlobal("location", { ...window.location, reload });
    // inviteRefusal logs the rejection so a silent lockout leaves a trace; keep it out of the
    // test output without losing the assertion that it happens (pinned in invite-error.test).
    consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    consoleError.mockRestore();
  });

  it("offers a RELOAD instead of Reintentar on the load path, where it costs nothing", async () => {
    // A reload strictly dominates a retry here: it re-runs describeInvite AND builds a new App
    // Check provider, which is the only thing that clears the 24 h 403 throttle. Nothing the
    // invitee has typed exists yet, so there is no reason to offer the weaker button.
    describeCallable.mockRejectedValue(attestationFailure);
    render(<InviteRedeemForm token="abc" />);
    const button = await screen.findByRole("button", { name: /recargar la página/i });
    expect(screen.queryByRole("button", { name: /reintentar/i })).not.toBeInTheDocument();
    // And it must not be withheld: the wait existed to stop someone hammering a button that
    // could not work yet, and this one can work immediately.
    expect(button).toBeEnabled();
    await userEvent.click(button);
    expect(reload).toHaveBeenCalled();
  });

  it("keeps Reintentar for a THROTTLED load failure — a reload would not help there", async () => {
    // The paired negative. Rate limiting is keyed per token on the server; reloading the page
    // does not refill the bucket, and it would throw away nothing useful either. The reload
    // belongs to the attestation arm alone.
    describeCallable.mockRejectedValue(refusal("invite-too-many-attempts"));
    render(<InviteRedeemForm token="abc" />);
    expect(await screen.findByRole("button", { name: /reintentar/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /recargar/i })).not.toBeInTheDocument();
  });

  it("puts the reload BEHIND the retry on submit, and warns what it costs", async () => {
    // THE DESIGN CALL. On this path a reload throws away a password the invitee has already
    // typed, to fix a cause that is transient two times out of three. So the withheld retry
    // stays the primary affordance and the reload sits under it — offered, because it is the
    // only escape from a 24 h throttle, but never taken silently and never unannounced.
    redeemCallable.mockRejectedValue(attestationFailure);
    render(<InviteRedeemForm token="abc" />);
    await screen.findByLabelText("Nueva contraseña");
    await fillPasswords("Abcde1");
    await userEvent.click(screen.getByRole("button", { name: /crear contraseña/i }));

    expect(await screen.findByRole("button", { name: /espera \d+s/i })).toBeDisabled();
    const reloadButton = screen.getByRole("button", { name: /recargar la página/i });
    expect(reloadButton).toBeEnabled();
    // The warning is the whole reason this is a button and not an automatic reload.
    expect(hasAlertMatching(/volver a escribir tu contraseña/i)).toBe(true);
    await userEvent.click(reloadButton);
    expect(reload).toHaveBeenCalled();
  });

  it("shows NO reload on an ordinary failed submit", async () => {
    // A weak password or a network blip is not an attestation problem, and offering to throw
    // the typed password away for either would be actively harmful advice.
    redeemCallable.mockRejectedValue(refusal("invite-password-weak"));
    render(<InviteRedeemForm token="abc" />);
    await screen.findByLabelText("Nueva contraseña");
    await fillPasswords("Abcde1");
    await userEvent.click(screen.getByRole("button", { name: /crear contraseña/i }));
    await waitFor(() => expect(hasAlertMatching(/no cumple los requisitos/i)).toBe(true));
    expect(screen.queryByRole("button", { name: /recargar/i })).not.toBeInTheDocument();
  });
});
