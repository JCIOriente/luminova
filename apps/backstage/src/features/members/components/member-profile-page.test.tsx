import { describe, expect, it, vi, beforeEach } from "vitest";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { Timestamp } from "firebase/firestore";
import { currentTermKey, type Member, type Position } from "@luminova/types";
import type { AuthClaims } from "@luminova/auth/roles";
import { roleClaims } from "@luminova/auth/test-helpers";

function member(over: Partial<Member> = {}): Member {
  return {
    id: "m1",
    name: "Ana Gómez",
    email: "ana@jci.bo",
    joinDate: Timestamp.now(),
    birthdate: Timestamp.now(),
    status: "Activo",
    profilePicture: null,
    totalPoints: 0,
    active: true,
    deletedAt: null,
    ...over,
  };
}

const memberQuery = {
  data: member(),
  isLoading: false,
  isError: false,
  error: null,
  refetch: vi.fn(),
};

vi.mock("@tanstack/react-router", async (orig) => ({
  ...(await orig<typeof import("@tanstack/react-router")>()),
  getRouteApi: () => ({ useParams: () => ({ memberId: "m1" }) }),
  Link: (props: { to: string; children: ReactNode }) => <a href={props.to}>{props.children}</a>,
}));

const POWER_CARGO: Position = {
  id: "pos-power",
  title: "Secretario",
  titleFemale: "Secretaria",
  category: "CEL",
  grants: ["Secretary"],
  term: null,
  sigla: null,
  description: "",
  active: true,
  deletedAt: null,
};
const positionsQuery = { data: [POWER_CARGO] as Position[] };

vi.mock("../hooks/use-member", () => ({ useMember: () => memberQuery }));
vi.mock("../../positions/hooks/use-positions", () => ({ usePositions: () => positionsQuery }));
vi.mock("../hooks/use-member-points", () => ({ useMemberPoints: () => ({ data: null }) }));
vi.mock("../hooks/use-member-participations", () => ({
  useMemberParticipations: () => ({ data: [] }),
}));
vi.mock("../hooks/use-member-points-by-term", () => ({
  useMemberPointsByTerm: () => ({ data: [] }),
}));
vi.mock("../../activities/hooks/use-activities-by-term", () => ({
  useActivitiesByTerm: () => ({ data: [] }),
}));
vi.mock("../../initiatives/hooks/use-initiatives-by-term", () => ({
  useInitiativesByTerm: () => ({ data: [] }),
}));
vi.mock("../hooks/use-update-member", () => ({
  useUpdateMember: () => ({ mutateAsync: vi.fn() }),
}));
vi.mock("../hooks/use-set-member-positions", () => ({
  useSetMemberPositions: () => ({ mutateAsync: vi.fn() }),
}));
vi.mock("../../../lib/auth/auth", () => ({
  useAuth: () => ({ user: { uid: "admin" }, claims: { roles: ["Admin"] } }),
}));
vi.mock("../../../lib/auth/request-password-reset", () => ({
  requestPasswordReset: vi.fn().mockResolvedValue(undefined),
}));

// The callable's result is what the component branches on, so it is the knob each case turns.
// vi.hoisted because the factory runs at import time, before any plain top-level const here
// has been evaluated.
const { provisionMutate } = vi.hoisted(() => ({ provisionMutate: vi.fn() }));
vi.mock("../hooks/use-provision-member-login", () => ({
  useProvisionMemberLogin: () => ({ mutate: provisionMutate, isPending: false }),
}));

import { MemberProfilePage } from "./member-profile-page";
import { AbilityProvider } from "../../../lib/authz/ability-context";
import { requestPasswordReset } from "../../../lib/auth/request-password-reset";

const mockedRequestPasswordReset = vi.mocked(requestPasswordReset);

/** Drive the mocked mutation's onSuccess with whatever beacon is pretending to return. */
function provisionResolvesWith(result: { email: string; actionLink: string }) {
  provisionMutate.mockImplementation((...args: unknown[]) => {
    const opts = args[1] as { onSuccess?: (r: typeof result) => void } | undefined;
    opts?.onSuccess?.(result);
  });
}

function renderPage(claims: AuthClaims = roleClaims("Admin")) {
  // The sidebar panels still run their own real queries (roles, etc.); a throwaway client with
  // retries off keeps them from retrying against a mock-less Firestore for the whole test.
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AbilityProvider claims={claims} uid="admin">
        <MemberProfilePage />
      </AbilityProvider>
    </QueryClientProvider>,
  );
}

describe("MemberProfilePage — InviteAccess", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedRequestPasswordReset.mockResolvedValue(undefined);
    memberQuery.data = member();
  });

  // BLOCKING: the reset MAIL is the delivery path for every new login — a stated owner
  // requirement that mail goes out for every new user. Returning an action link (which beacon
  // does only for an ADMIN caller) used to short-circuit it with an early `return`, so this was
  // the one surface where an Admin's invite sent nothing and the member waited for a mail that
  // never came. The link is a manual FALLBACK on top, never a substitute.
  it("BLOCKING: sends the reset mail even when beacon returns an action link", async () => {
    provisionResolvesWith({ email: "ana@jci.bo", actionLink: "https://example.com/link" });
    renderPage();
    await userEvent.click(screen.getByRole("button", { name: "Invitar acceso" }));
    await waitFor(() => expect(mockedRequestPasswordReset).toHaveBeenCalledWith("ana@jci.bo"));
    expect(mockedRequestPasswordReset).toHaveBeenCalledTimes(1);
    expect(await screen.findByText("Invitación enviada por correo.")).toBeInTheDocument();
    // …and the link is still offered as the manual fallback.
    expect(screen.getByRole("button", { name: /Copiar enlace/ })).toBeInTheDocument();
  });

  it("sends the reset mail when beacon withholds the link (delegate caller)", async () => {
    provisionResolvesWith({ email: "ana@jci.bo", actionLink: "" });
    renderPage();
    await userEvent.click(screen.getByRole("button", { name: "Invitar acceso" }));
    await waitFor(() => expect(mockedRequestPasswordReset).toHaveBeenCalledWith("ana@jci.bo"));
    expect(await screen.findByText("Invitación enviada por correo.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Copiar enlace/ })).not.toBeInTheDocument();
  });

  // BLOCKING: the mail failure is now rendered TWICE — once in the header and once inside the
  // dialog — and the second copy is the load-bearing one. The dialog opens as soon as the link
  // arrives, before the mail settles; while it is open its modal `aria-hidden` takes the header
  // alert out of the accessibility tree, so a screen-reader user heard only the dialog's
  // "comparte este enlace" and never learned the mail had failed at all.
  it("BLOCKING: repeats the mail failure INSIDE the dialog, not only in the header", async () => {
    provisionResolvesWith({ email: "ana@jci.bo", actionLink: "https://example.com/link" });
    mockedRequestPasswordReset.mockRejectedValue(new Error("network"));
    renderPage();
    await userEvent.click(screen.getByRole("button", { name: "Invitar acceso" }));
    const copy =
      "Se creó el acceso, pero no se pudo enviar el correo. Comparte el enlace manualmente.";
    // getAllByText, not getByText: two renders of the same sentence is the point of the fix.
    await waitFor(() => expect(screen.getAllByText(copy)).toHaveLength(2));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByRole("alert")).toHaveTextContent(copy);
    // The header copy stays for after the dialog is dismissed — it is not moved, it is echoed.
    expect(within(dialog).getAllByText(copy)).toHaveLength(1);
  });

  it("points at an administrator when the mail fails and there is no link to share", async () => {
    provisionResolvesWith({ email: "ana@jci.bo", actionLink: "" });
    mockedRequestPasswordReset.mockRejectedValue(new Error("network"));
    renderPage();
    await userEvent.click(screen.getByRole("button", { name: "Invitar acceso" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Se creó el acceso, pero no se pudo enviar el correo. Pídele a un administrador que lo reenvíe.",
    );
  });

  // BLOCKING: the reset MAIL is a floating promise the mutation does not track, so
  // `provision.isPending` goes false the moment the CALLABLE resolves — long before the mail
  // settles. The button therefore re-enabled mid-flight and a second click could interleave:
  // attempt one's mail resolving into `sent` while attempt two's rejected into `error`, leaving
  // the header asserting both at once (or, with the other ordering, a real failure silently
  // overwritten by a stale success). `sending` is what closes that window; it is the guard, so
  // it is what gets asserted rather than the unreachable race it prevents.
  it("BLOCKING: stays disabled until the reset mail settles, not just the callable", async () => {
    provisionResolvesWith({ email: "ana@jci.bo", actionLink: "" });
    let settleMail = () => {};
    mockedRequestPasswordReset.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          settleMail = () => resolve();
        }),
    );
    renderPage();
    const button = screen.getByRole("button", { name: "Invitar acceso" });
    await userEvent.click(button);
    // The callable already resolved (the mock calls onSuccess synchronously) and isPending is
    // hardcoded false, so ONLY `sending` can be holding this.
    const pendingButton = screen.getByRole("button", { name: "Generando…" });
    expect(pendingButton).toBeDisabled();
    await act(async () => {
      settleMail();
    });
    expect(screen.getByRole("button", { name: "Invitar acceso" })).toBeEnabled();
    expect(screen.getByText("Invitación enviada por correo.")).toBeInTheDocument();
  });

  // The invariant the `attempt` ref and the resets exist to hold, asserted across the retry
  // that the re-enabled button makes reachable: the header must never claim a failure and a
  // success at the same time. `invite()` clears both up front, so the second attempt's outcome
  // fully replaces the first one's rather than accumulating beside it.
  it("BLOCKING: never shows the sent confirmation and the failure alert together", async () => {
    provisionResolvesWith({ email: "ana@jci.bo", actionLink: "" });
    mockedRequestPasswordReset.mockRejectedValue(new Error("network"));
    renderPage();
    await userEvent.click(screen.getByRole("button", { name: "Invitar acceso" }));
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.queryByText("Invitación enviada por correo.")).not.toBeInTheDocument();

    mockedRequestPasswordReset.mockResolvedValue(undefined);
    await userEvent.click(screen.getByRole("button", { name: "Invitar acceso" }));
    expect(await screen.findByText("Invitación enviada por correo.")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  // BLOCKING: `open` is no longer separate state — the dialog is `open={link !== null}`, and
  // dismissing it clears `link`. Keeping the two in sync by hand is what left `link` out of
  // invite()'s reset in the first place; deriving one from the other means a dismiss that did
  // not clear `link` would make the dialog impossible to close at all. So closing it, and
  // having it STAY closed, is the assertion that pins the derivation.
  it("BLOCKING: closes the link dialog by clearing the link, and it stays closed", async () => {
    provisionResolvesWith({ email: "ana@jci.bo", actionLink: "https://example.com/link" });
    renderPage();
    await userEvent.click(screen.getByRole("button", { name: "Invitar acceso" }));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("https://example.com/link")).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.queryByText("https://example.com/link")).not.toBeInTheDocument();
  });

  // The other half of that state collapse: invite() now resets `link` alongside `sent`,
  // `error` and the copy state. A second invite that comes back WITHOUT a link (beacon
  // withholds it from a non-Admin caller) must not re-open the dialog on the previous
  // attempt's credential — an action link is a bearer credential for the account.
  it("BLOCKING: a later linkless invite does not resurrect the previous action link", async () => {
    provisionResolvesWith({ email: "ana@jci.bo", actionLink: "https://example.com/link" });
    renderPage();
    await userEvent.click(screen.getByRole("button", { name: "Invitar acceso" }));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    provisionResolvesWith({ email: "ana@jci.bo", actionLink: "" });
    await userEvent.click(screen.getByRole("button", { name: "Invitar acceso" }));
    await waitFor(() =>
      expect(screen.getByText("Invitación enviada por correo.")).toBeInTheDocument(),
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByText("https://example.com/link")).not.toBeInTheDocument();
  });
});

// The four call sites all pass `allowReplacePowerCargo={isAdmin}` — a value the two form unit
// tests receive as a prop and therefore cannot police. These cover the profile page's two, the
// only place a delegate meets a seated member.
describe("MemberProfilePage — cargo editor for a board-seat delegate", () => {
  const term = currentTermKey();
  const seatedOnPower = () =>
    member({ positions: { [term]: { cargoId: POWER_CARGO.id, comisionIds: [] } } });

  beforeEach(() => {
    vi.clearAllMocks();
    memberQuery.data = seatedOnPower();
  });

  // update:BoardSeat lifts the NEW-side conjunct only. Passing it as allowReplacePowerCargo
  // would open the picker on a write positionsAssignmentSafe() always denies.
  it("BLOCKING: locks the full MemberForm's cargo picker for a delegate", () => {
    renderPage({ roles: ["Member"], perms: ["update:Member", "update:BoardSeat"] });
    expect(screen.getByLabelText("Cargo")).toBeDisabled();
    expect(screen.getByText(/Solo un administrador puede cambiar el cargo/i)).toBeInTheDocument();
  });

  it("BLOCKING: locks the positions-only form's cargo picker for a delegate", () => {
    renderPage({ roles: ["Member"], perms: ["update:Position", "update:BoardSeat"] });
    expect(screen.getByLabelText("Cargo")).toBeDisabled();
    expect(screen.getByText(/Solo un administrador puede cambiar los cargos/i)).toBeInTheDocument();
  });

  it("leaves both open for an Admin on the same seat", () => {
    renderPage();
    expect(screen.getByLabelText("Cargo")).not.toBeDisabled();
    expect(screen.queryByText(/Solo un administrador puede cambiar/i)).not.toBeInTheDocument();
  });
});

// The finding, at the call site that produces the argument. `isSelfAssignment` is computed
// HERE — `member.uid !== undefined && member.uid === uid` — so the two form unit tests, which
// receive it as a prop, cannot police it. The mocked useAuth returns uid "admin"; a member doc
// carrying that same uid IS the caller.
describe("MemberProfilePage — a delegate seating themselves", () => {
  const MINT_PENDING_COPY = /no se aplicarán hasta que un administrador confirme la asignación/i;

  // Vacant, not seated: the delegate is picking a cargo nobody holds, which is precisely the
  // write firestore.rules' boardSeatDelegate() permits. Seating them on an occupied power
  // cargo would lock the picker and never reach the note.
  const self = () => member({ uid: "admin" });

  beforeEach(() => {
    vi.clearAllMocks();
    memberQuery.data = self();
  });

  // BLOCKING: a delegate holding update:Position + update:BoardSeat opens THEIR OWN profile and
  // seats themselves on a vacant Secretario — a power cargo that does NOT grant Admin. The
  // write succeeds, the seat publishes to the Directiva, and resolveTrustedGrants mints nothing
  // because `selfAssigned && !assignerIsAdmin`. syncMemberClaims is a background trigger, so
  // nothing in the save path can report it. Before the fix the warning keyed on
  // `grants.includes("Admin")` alone and no note rendered at all.
  it("BLOCKING: warns on the positions-only form when the delegate is the member", async () => {
    renderPage({ roles: ["Member"], perms: ["update:Position", "update:BoardSeat"] });
    expect(screen.queryByText(MINT_PENDING_COPY)).not.toBeInTheDocument();
    await userEvent.click(screen.getByLabelText("Cargo"));
    await userEvent.click(await screen.findByText(/Secretari[ao]/));
    expect(screen.getByText(MINT_PENDING_COPY)).toBeInTheDocument();
  });

  it("BLOCKING: warns on the full member form when the delegate is the member", async () => {
    renderPage({ roles: ["Member"], perms: ["update:Member", "update:BoardSeat"] });
    await userEvent.click(screen.getByLabelText("Cargo"));
    await userEvent.click(await screen.findByText(/Secretari[ao]/));
    expect(screen.getByText(MINT_PENDING_COPY)).toBeInTheDocument();
  });

  // The control that keeps the page's `isSelfAssignment` expression honest: the SAME delegate
  // on SOMEONE ELSE's profile (member.uid !== the caller's uid) is silent, because
  // update:BoardSeat does mint a Secretary seat for another member. If the page hardcoded
  // `true`, or compared the wrong pair of ids, this is the case that catches it.
  it("BLOCKING: stays silent for that delegate on someone else's profile", async () => {
    memberQuery.data = member({ uid: "someone-else" });
    renderPage({ roles: ["Member"], perms: ["update:Position", "update:BoardSeat"] });
    await userEvent.click(screen.getByLabelText("Cargo"));
    await userEvent.click(await screen.findByText(/Secretari[ao]/));
    expect(screen.queryByText(MINT_PENDING_COPY)).not.toBeInTheDocument();
  });

  // …and a member with NO uid at all is not the caller either, however the comparison is
  // written. `undefined === undefined` would be true for a signed-out caller; the page guards
  // that explicitly, and an unlinked member is the commonest doc shape in the collection.
  it("BLOCKING: stays silent for a member who has no uid", async () => {
    memberQuery.data = member();
    renderPage({ roles: ["Member"], perms: ["update:Position", "update:BoardSeat"] });
    await userEvent.click(screen.getByLabelText("Cargo"));
    await userEvent.click(await screen.findByText(/Secretari[ao]/));
    expect(screen.queryByText(MINT_PENDING_COPY)).not.toBeInTheDocument();
  });

  it("stays silent for an ADMIN on their own profile — they mint what they assign", async () => {
    renderPage();
    await userEvent.click(screen.getByLabelText("Cargo"));
    await userEvent.click(await screen.findByText(/Secretari[ao]/));
    expect(screen.queryByText(MINT_PENDING_COPY)).not.toBeInTheDocument();
  });
});
