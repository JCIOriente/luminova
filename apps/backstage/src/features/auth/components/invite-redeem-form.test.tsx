import { describe, it, expect, vi, beforeEach } from "vitest";
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

  it("names a TAGGED redemption failure instead of a generic one", async () => {
    // invite-update-failed in particular: the token is spent and the password was never set,
    // so "inténtalo de nuevo" would be a lie.
    redeemCallable.mockRejectedValue(refusal("invite-update-failed"));
    render(<InviteRedeemForm token="abc" />);
    await screen.findByLabelText("Nueva contraseña");
    await fillPasswords("Abcde1");
    await userEvent.click(screen.getByRole("button", { name: /crear contraseña/i }));
    await waitFor(() =>
      expect(
        screen.getAllByRole("alert").some((a) => /ya se consumió/i.test(a.textContent ?? "")),
      ).toBe(true),
    );
  });
});
