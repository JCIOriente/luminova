import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ReactElement, ReactNode } from "react";
import type { Position } from "@luminova/types";
import { MemberInviteDrawer } from "./member-invite-drawer";
import { AbilityProvider } from "../../../lib/authz/ability-context";
import { pickDate } from "../../../test/pick-date";

/** A catalog whose only cargo confers a role — the input to `draftProvisionBlocked`. Shared so
 *  the delegate case and the Admin case below differ in the CALLER and nothing else. */
const powerCargoCatalog: Position[] = [
  {
    id: "pos-power",
    title: "Secretario",
    titleFemale: null,
    category: "CEL",
    grants: ["Secretary"],
    term: null,
    sigla: null,
    description: "",
    active: true,
    deletedAt: null,
  },
];

// The drawer's "Enviar acceso" checkbox is gated on canProvisionLogin (Admin role OR the
// exact create:MemberLogin perm); default to Admin so the provisioning path under test is
// available, and parameterize for the delegation cases below.
function renderWithAbility(
  ui: ReactElement,
  claims: { roles: string[]; perms?: string[] } = { roles: ["Admin"], perms: ["manage:all"] },
) {
  return render(ui, {
    wrapper: ({ children }: { children: ReactNode }) => (
      <AbilityProvider claims={claims as never} uid="admin">
        {children}
      </AbilityProvider>
    ),
  });
}

vi.mock("../../../lib/auth/request-password-reset", () => ({
  requestPasswordReset: vi.fn().mockResolvedValue(undefined),
}));

import { requestPasswordReset } from "../../../lib/auth/request-password-reset";
const mockedRequestPasswordReset = vi.mocked(requestPasswordReset);

async function fill() {
  fireEvent.change(screen.getByLabelText(/Nombre/), { target: { value: "Ana Gómez" } });
  fireEvent.change(screen.getByLabelText(/Correo/), { target: { value: "ana@jci.bo" } });
  fireEvent.click(screen.getByRole("button", { name: "Femenino" }));
  await pickDate(/Fecha de nacimiento/, "1990-01-15");
}

describe("MemberInviteDrawer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedRequestPasswordReset.mockResolvedValue(undefined);
  });

  it("blocks submit and stays on the form when required fields are empty", async () => {
    const onCreate = vi.fn();
    renderWithAbility(
      <MemberInviteDrawer
        open
        positions={[]}
        onClose={() => {}}
        onCreate={onCreate}
        onProvision={async () => ({ email: "", actionLink: "" })}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Enviar invitación" }));
    await waitFor(() =>
      expect(screen.getAllByText("Mínimo 3 caracteres.").length).toBeGreaterThan(0),
    );
    expect(onCreate).not.toHaveBeenCalled();
  });

  it("creates the member then provisions login when access is checked, reaching done", async () => {
    const onCreate = vi.fn().mockResolvedValue("new-id");
    const onProvision = vi
      .fn()
      .mockResolvedValue({ email: "ana@jci.bo", actionLink: "https://example.com/link" });
    renderWithAbility(
      <MemberInviteDrawer
        open
        positions={[]}
        onClose={() => {}}
        onCreate={onCreate}
        onProvision={onProvision}
      />,
    );
    await fill();
    fireEvent.click(screen.getByRole("button", { name: "Enviar invitación" }));
    await waitFor(() => expect(screen.getByText("Ana Gómez fue agregada")).toBeInTheDocument());
    expect(onCreate).toHaveBeenCalledTimes(1);
    expect(onProvision).toHaveBeenCalledWith("new-id");
    expect(mockedRequestPasswordReset).toHaveBeenCalledWith("ana@jci.bo");
    expect(screen.getByText(/Invitación enviada a ana@jci\.bo/)).toBeInTheDocument();
    expect(screen.getByText(/recibirá un correo/i)).toBeInTheDocument();
  });

  it("skips provisioning when access is unchecked", async () => {
    const onProvision = vi
      .fn()
      .mockResolvedValue({ email: "ana@jci.bo", actionLink: "https://example.com/link" });
    renderWithAbility(
      <MemberInviteDrawer
        open
        positions={[]}
        onClose={() => {}}
        onCreate={async () => "id2"}
        onProvision={onProvision}
      />,
    );
    await fill();
    fireEvent.click(screen.getByLabelText("Enviar acceso a la app"));
    fireEvent.click(screen.getByRole("button", { name: "Enviar invitación" }));
    await waitFor(() => expect(screen.getByText("Ana Gómez fue agregada")).toBeInTheDocument());
    expect(onProvision).not.toHaveBeenCalled();
    expect(mockedRequestPasswordReset).not.toHaveBeenCalled();
    expect(screen.getByText(/Aún no tiene acceso/)).toBeInTheDocument();
  });

  it("shows email-sent copy when requestPasswordReset resolves", async () => {
    renderWithAbility(
      <MemberInviteDrawer
        open
        positions={[]}
        onClose={() => {}}
        onCreate={async () => "id3"}
        onProvision={async () => ({ email: "ana@jci.bo", actionLink: "https://example.com/link" })}
      />,
    );
    await fill();
    fireEvent.click(screen.getByRole("button", { name: "Enviar invitación" }));
    await waitFor(() =>
      expect(screen.getByText(/Invitación enviada a ana@jci\.bo/)).toBeInTheDocument(),
    );
    expect(screen.getByText(/recibirá un correo para crear su contraseña/i)).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("shows warning and copy-link button when requestPasswordReset rejects", async () => {
    mockedRequestPasswordReset.mockRejectedValue(new Error("network error"));
    renderWithAbility(
      <MemberInviteDrawer
        open
        positions={[]}
        onClose={() => {}}
        onCreate={async () => "id4"}
        onProvision={async () => ({
          email: "ana@jci.bo",
          actionLink: "https://example.com/action-link",
        })}
      />,
    );
    await fill();
    fireEvent.click(screen.getByRole("button", { name: "Enviar invitación" }));
    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(screen.getByRole("alert")).toHaveTextContent(
      "El correo no se pudo enviar. Comparte el enlace de acceso manualmente.",
    );
    expect(screen.getByRole("button", { name: "Copiar enlace de acceso" })).toBeInTheDocument();
  });

  // BLOCKING: the copy button is the fallback for a failed mail — the second fallback in a row
  // — and jsdom's navigator has no `clipboard`, exactly like an insecure context. The click
  // used to read `navigator.clipboard.writeText` and throw a TypeError synchronously, so the
  // `.catch()` never ran, `copyState` never became "failed", and the select-all `<code>` that
  // exists precisely for this never rendered. Routed through useCopyToClipboard now.
  it("BLOCKING: falls back to a selectable link when the clipboard API is unavailable", async () => {
    mockedRequestPasswordReset.mockRejectedValue(new Error("network error"));
    renderWithAbility(
      <MemberInviteDrawer
        open
        positions={[]}
        onClose={() => {}}
        onCreate={async () => "idClip"}
        onProvision={async () => ({
          email: "ana@jci.bo",
          actionLink: "https://example.com/action-link",
        })}
      />,
    );
    await fill();
    fireEvent.click(screen.getByRole("button", { name: "Enviar invitación" }));
    const copyButton = await screen.findByRole("button", { name: "Copiar enlace de acceso" });
    expect(navigator.clipboard).toBeUndefined();
    await userEvent.click(copyButton);
    expect(await screen.findByText("https://example.com/action-link")).toBeInTheDocument();
  });

  // --- create:MemberLogin delegation ---

  const drawer = (
    onProvision = vi.fn().mockResolvedValue({ email: "a@b.co", actionLink: "l" }),
  ) => ({
    node: (
      <MemberInviteDrawer
        open
        positions={[]}
        onClose={() => {}}
        onCreate={async () => "idD"}
        onProvision={onProvision}
      />
    ),
    onProvision,
  });

  it("shows 'Enviar acceso' to a create:MemberLogin delegate, defaulted ON, and provisions", async () => {
    const { node, onProvision } = drawer();
    renderWithAbility(node, { roles: ["Member"], perms: ["create:Member", "create:MemberLogin"] });
    const checkbox = screen.getByLabelText("Enviar acceso a la app");
    expect(checkbox).toBeChecked();
    await fill();
    fireEvent.click(screen.getByRole("button", { name: "Enviar invitación" }));
    await waitFor(() => expect(onProvision).toHaveBeenCalledWith("idD"));
  });

  it("hides it from a member creator without the code, and never calls onProvision", async () => {
    const { node, onProvision } = drawer();
    renderWithAbility(node, { roles: ["Member"], perms: ["create:Member"] });
    expect(screen.queryByLabelText("Enviar acceso a la app")).not.toBeInTheDocument();
    await fill();
    fireEvent.click(screen.getByRole("button", { name: "Enviar invitación" }));
    // Wait for the POSITIVE signal, not the absence of an alert: the negative is already true
    // before the submit resolves, so a waitFor on it returns on the first tick and the
    // onProvision assertion below would pass merely because the async handler had not run yet.
    await screen.findByText(/Aún no tiene acceso a la app/);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(onProvision).not.toHaveBeenCalled();
  });

  it("BLOCKING: hides it from a manage:all perm holder without the Admin role", async () => {
    // The render-then-403 this gate exists to stop: beacon's requireAdminOrPerm is an exact
    // code test, so the wildcard would fail server-side after the member was already created.
    const { node } = drawer();
    renderWithAbility(node, { roles: ["Member"], perms: ["manage:all"] });
    expect(screen.queryByLabelText("Enviar acceso a la app")).not.toBeInTheDocument();
  });

  it("does not attempt the invite when the cargo confers permissions and the caller is a delegate", async () => {
    // beacon's power-seat guard would refuse it, so attempting it would create the member,
    // 403, and point the user at a row action that fails identically forever.
    const onProvision = vi.fn();
    renderWithAbility(
      <MemberInviteDrawer
        open
        positions={powerCargoCatalog}
        onClose={() => {}}
        onCreate={async () => "idB"}
        onProvision={onProvision}
      />,
      { roles: ["Member"], perms: ["create:Member", "create:MemberLogin", "update:BoardSeat"] },
    );
    await fill();
    await userEvent.click(screen.getByLabelText("Cargo"));
    // positionTitle derives the female variant from the title when titleFemale is null, and
    // fill() picks "Femenino" — so the rendered label is "Secretaria".
    await userEvent.click(await screen.findByText(/Secretari[ao]/));
    fireEvent.click(screen.getByRole("button", { name: "Enviar invitación" }));
    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(screen.getByRole("alert")).toHaveTextContent(
      /solo un administrador puede enviarle el acceso/,
    );
    expect(onProvision).not.toHaveBeenCalled();
  });

  // The `!isAdmin` term of provisionBlocked had no test: every Admin-path case above passes
  // positions={[]}, so seatedCargo was always undefined and the cargo clause never fired.
  // Mutate that term away and this is the only case that notices — without it, an Admin
  // inviting a board member would be told "solo un administrador puede enviarle el acceso",
  // self-contradictory copy, suite green.
  it("BLOCKING: an ADMIN inviting a member on a power-granting cargo still provisions", async () => {
    const onProvision = vi
      .fn()
      .mockResolvedValue({ email: "ana@jci.bo", actionLink: "https://example.com/link" });
    renderWithAbility(
      <MemberInviteDrawer
        open
        positions={powerCargoCatalog}
        onClose={() => {}}
        onCreate={async () => "idAdminPower"}
        onProvision={onProvision}
      />,
    );
    await fill();
    await userEvent.click(screen.getByLabelText("Cargo"));
    await userEvent.click(await screen.findByText(/Secretari[ao]/));
    fireEvent.click(screen.getByRole("button", { name: "Enviar invitación" }));
    await waitFor(() => expect(onProvision).toHaveBeenCalledWith("idAdminPower"));
    expect(await screen.findByText(/Invitación enviada a ana@jci\.bo/)).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  // BLOCKING: the same delegate, same power cargo, but with "Enviar acceso" UNTICKED. Nothing
  // was attempted, so this is not the blockedByCargo alert — it is the plain done screen, and
  // it used to read "Podrás invitarlo desde el menú de su fila". That row action is hidden
  // from this very caller by memberProvisionBlocked, for the identical reason, so the copy
  // pointed them at an affordance that is not there and would never appear. `blockedByCargo`
  // could not carry this: it ANDs in sendAccess, which is false here by construction.
  it("BLOCKING: tells a blocked delegate to ask an administrator, not to use the row menu", async () => {
    const onProvision = vi.fn();
    renderWithAbility(
      <MemberInviteDrawer
        open
        positions={powerCargoCatalog}
        onClose={() => {}}
        onCreate={async () => "idUnticked"}
        onProvision={onProvision}
      />,
      { roles: ["Member"], perms: ["create:Member", "create:MemberLogin", "update:BoardSeat"] },
    );
    await fill();
    await userEvent.click(screen.getByLabelText("Cargo"));
    await userEvent.click(await screen.findByText(/Secretari[ao]/));
    fireEvent.click(screen.getByLabelText("Enviar acceso a la app"));
    fireEvent.click(screen.getByRole("button", { name: "Enviar invitación" }));
    expect(await screen.findByText(/un administrador debe enviarle el acceso/)).toBeInTheDocument();
    expect(screen.queryByText(/desde el menú de su fila/)).not.toBeInTheDocument();
    // Nothing was attempted and nothing failed, so this is guidance, not an error.
    expect(onProvision).not.toHaveBeenCalled();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("keeps the row-menu copy when the delegate is NOT blocked", async () => {
    // The control: same caller, same unticked checkbox, no power cargo. The row action IS
    // available to them here, so sending them to it is correct — the new branch must not
    // swallow the ordinary case.
    renderWithAbility(
      <MemberInviteDrawer
        open
        positions={powerCargoCatalog}
        onClose={() => {}}
        onCreate={async () => "idPlain"}
        onProvision={vi.fn()}
      />,
      { roles: ["Member"], perms: ["create:Member", "create:MemberLogin", "update:BoardSeat"] },
    );
    await fill();
    fireEvent.click(screen.getByLabelText("Enviar acceso a la app"));
    fireEvent.click(screen.getByRole("button", { name: "Enviar invitación" }));
    expect(await screen.findByText(/desde el menú de su fila/)).toBeInTheDocument();
    expect(screen.queryByText(/un administrador debe enviarle el acceso/)).not.toBeInTheDocument();
  });

  it("BLOCKING: never promises the row action to a creator who lacks create:MemberLogin", async () => {
    // The OTHER conjunct the row item is gated on. This principal reaches the drawer — the
    // trigger only asks `Can I="create" a="Member"` — but never sees "Invitar a la app" in the
    // row menu, because canProvisionLogin is false. The checkbox is not rendered for them
    // either, so they always land on this branch, on an ordinary grant-free member.
    renderWithAbility(
      <MemberInviteDrawer
        open
        positions={powerCargoCatalog}
        onClose={() => {}}
        onCreate={async () => "idCreatorOnly"}
        onProvision={vi.fn()}
      />,
      // read:Member too: /members' nav gate is an unconditional read:Member, so a
      // create-only principal never reaches the page that hosts this drawer.
      { roles: ["Member"], perms: ["read:Member", "create:Member"] },
    );
    expect(screen.queryByLabelText("Enviar acceso a la app")).not.toBeInTheDocument();
    await fill();
    fireEvent.click(screen.getByRole("button", { name: "Enviar invitación" }));
    expect(
      await screen.findByText(/Pídele a un administrador que le envíe el acceso/),
    ).toBeInTheDocument();
    expect(screen.queryByText(/desde el menú de su fila/)).not.toBeInTheDocument();
  });

  it("keeps the row-menu copy for an ADMIN who unticked the checkbox on a power cargo", async () => {
    // draftProvisionBlocked short-circuits on callerIsAdmin, so `provisionBlocked` is false
    // for them even seated on the power cargo — an Admin can always invite from the row. This
    // is the case the old `!isAdmin &&` conjunct at the call site used to cover.
    renderWithAbility(
      <MemberInviteDrawer
        open
        positions={powerCargoCatalog}
        onClose={() => {}}
        onCreate={async () => "idAdminUnticked"}
        onProvision={vi.fn()}
      />,
    );
    await fill();
    await userEvent.click(screen.getByLabelText("Cargo"));
    await userEvent.click(await screen.findByText(/Secretari[ao]/));
    fireEvent.click(screen.getByLabelText("Enviar acceso a la app"));
    fireEvent.click(screen.getByRole("button", { name: "Enviar invitación" }));
    expect(await screen.findByText(/desde el menú de su fila/)).toBeInTheDocument();
  });

  // --- provision refusals: tagged reason vs raw diagnostic ---

  /** A rejection shaped like the callable's: a FirebaseError carries the server's English prose
   *  as `message` and the machine-readable refusal under `details.reason`. */
  function provisionRefusal(reason: string, message: string) {
    return Object.assign(new Error(message), { details: { reason } });
  }

  // BLOCKING: this drawer was the third and last provisioning entry point, and the only one
  // still rendering the server's raw English prose to a Spanish-speaking operator. The row menu
  // and the profile header already routed refusals through provisionErrorMessage; a delegate
  // who hit `reprovision-requires-admin` here read "this member already has a login…" and had
  // no idea an Admin could finish it — so they retried the invite forever.
  it("BLOCKING: maps a TAGGED provision refusal to its Spanish message", async () => {
    const onProvision = vi
      .fn()
      .mockRejectedValue(
        provisionRefusal(
          "reprovision-requires-admin",
          "this member already has a login; only an Admin can re-send it",
        ),
      );
    renderWithAbility(
      <MemberInviteDrawer
        open
        positions={[]}
        onClose={() => {}}
        onCreate={async () => "idTagged"}
        onProvision={onProvision}
      />,
      { roles: ["Member"], perms: ["create:Member", "create:MemberLogin"] },
    );
    await fill();
    fireEvent.click(screen.getByRole("button", { name: "Enviar invitación" }));
    expect(
      await screen.findByText(
        /Ya existe un acceso para este correo\. Pídele a un administrador que lo reenvíe o lo vincule\./,
      ),
    ).toBeInTheDocument();
    // BLOCKING: the refusal must be the HEADLINE, not small print under a contradiction.
    // The default fallback tells the operator to invite from the row menu — and that item IS
    // offered here, because memberProvisionBlocked keys `hasLogin` on member.uid and this
    // just-created doc has none: beacon refused on the Auth directory, which the client cannot
    // see. Demoting the real reason to "Detalle:" therefore sends them into exactly the
    // infinite retry this mapping exists to end.
    expect(screen.queryByText(/desde el menú de su fila/)).not.toBeInTheDocument();
    expect(screen.queryByText(/^Detalle:/)).not.toBeInTheDocument();
    // The raw prose must be GONE, not merely accompanied — it is the thing being replaced.
    expect(screen.queryByText(/this member already has a login/)).not.toBeInTheDocument();
    // The member was still created, so the done screen is guidance, not a create failure.
    expect(screen.getByText("Ana Gómez fue agregada")).toBeInTheDocument();
  });

  // The other half of the same line, and the reason the raw message stays as the FALLBACK: an
  // App Check / quota / config failure carries no `details.reason`, and its message is the one
  // diagnostic anybody gets. A fix that mapped everything to a generic Spanish sentence would
  // pass the test above and destroy this.
  it("BLOCKING: keeps the raw message for an UNTAGGED provision failure", async () => {
    const onProvision = vi.fn().mockRejectedValue(new Error("AppCheck token is invalid"));
    renderWithAbility(
      <MemberInviteDrawer
        open
        positions={[]}
        onClose={() => {}}
        onCreate={async () => "idUntagged"}
        onProvision={onProvision}
      />,
      { roles: ["Member"], perms: ["create:Member", "create:MemberLogin"] },
    );
    await fill();
    fireEvent.click(screen.getByRole("button", { name: "Enviar invitación" }));
    expect(await screen.findByText(/Detalle: AppCheck token is invalid/)).toBeInTheDocument();
  });

  // A `reason` that is not in the table — beacon adding one before the client ships the copy —
  // falls back the same way. Pinned separately because a Map lookup returning `undefined` and a
  // plain-object lookup returning `Object.prototype.toString` are both "not found", and only
  // one of them renders a function into the DOM.
  it("falls back to the raw message for an UNKNOWN tagged reason", async () => {
    const onProvision = vi
      .fn()
      .mockRejectedValue(provisionRefusal("some-future-reason", "server said no"));
    renderWithAbility(
      <MemberInviteDrawer
        open
        positions={[]}
        onClose={() => {}}
        onCreate={async () => "idUnknown"}
        onProvision={onProvision}
      />,
      { roles: ["Member"], perms: ["create:Member", "create:MemberLogin"] },
    );
    await fill();
    fireEvent.click(screen.getByRole("button", { name: "Enviar invitación" }));
    expect(await screen.findByText(/Detalle: server said no/)).toBeInTheDocument();
  });

  // beacon withholds the action link from a non-Admin caller (it is a bearer credential for
  // the account), so a delegate whose reset mail then fails has NO manual fallback — the copy
  // must send them to an Admin rather than to a copy button that would copy nothing. Only
  // reachable as delegate + provision succeeded + requestPasswordReset rejected.
  it("BLOCKING: tells a delegate to ask an administrator when there is no action link to share", async () => {
    mockedRequestPasswordReset.mockRejectedValue(new Error("network error"));
    renderWithAbility(
      <MemberInviteDrawer
        open
        positions={[]}
        onClose={() => {}}
        onCreate={async () => "idNoLink"}
        onProvision={async () => ({ email: "ana@jci.bo", actionLink: "" })}
      />,
      { roles: ["Member"], perms: ["create:Member", "create:MemberLogin"] },
    );
    await fill();
    fireEvent.click(screen.getByRole("button", { name: "Enviar invitación" }));
    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(screen.getByRole("alert")).toHaveTextContent(
      "El correo no se pudo enviar. Pídele a un administrador que reenvíe la invitación.",
    );
    expect(
      screen.queryByRole("button", { name: /Copiar enlace de acceso/ }),
    ).not.toBeInTheDocument();
  });
});
