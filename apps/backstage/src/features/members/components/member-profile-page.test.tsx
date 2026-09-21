import { describe, expect, it, vi, afterEach, beforeEach } from "vitest";
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
const positionsQuery = { data: [POWER_CARGO] as Position[] | undefined, isError: false };

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

// The REAL useProvisionMemberLogin runs here, with only its two edges mocked: the callable and
// the reset mail. Faking the hook itself is what let the "mail sent from a component-scoped
// onSuccess" bug survive — a hand-written fake that invokes `opts.onSuccess` unconditionally
// models a TanStack mutation that always has listeners, which is precisely the thing that is
// not true. vi.hoisted because the factories run at import time.
const { callable } = vi.hoisted(() => ({ callable: vi.fn() }));
vi.mock("firebase/functions", () => ({ httpsCallable: () => callable }));
vi.mock("@luminova/firebase/functions", () => ({ getFunctionsService: () => ({}) }));

import { MemberProfilePage } from "./member-profile-page";
import { AbilityProvider } from "../../../lib/authz/ability-context";
import { requestPasswordReset } from "../../../lib/auth/request-password-reset";

const mockedRequestPasswordReset = vi.mocked(requestPasswordReset);

/** What beacon is pretending to return. The MAIL's outcome is the other knob
 *  (`mockedRequestPasswordReset`); together they decide whether a fallback link exists. */
function provisionResolvesWith(result: { email: string; actionLink: string }) {
  callable.mockResolvedValue({ data: result });
}

function pageTree(claims: AuthClaims, queryClient: QueryClient) {
  return (
    <QueryClientProvider client={queryClient}>
      <AbilityProvider claims={claims} uid="admin">
        <MemberProfilePage />
      </AbilityProvider>
    </QueryClientProvider>
  );
}

function renderPage(claims: AuthClaims = roleClaims("Admin")) {
  // The sidebar panels still run their own real queries (roles, etc.); a throwaway client with
  // retries off keeps them from retrying against a mock-less Firestore for the whole test.
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(pageTree(claims, queryClient));
  return {
    ...view,
    /** Re-render the SAME tree after mutating `memberQuery.data` — what the real page does when
     *  `useMember` refetches. Identical element type at the identical position, so React keeps
     *  the subtree mounted and any state it holds survives; that is precisely the property
     *  under test below. */
    refetchMember: () => view.rerender(pageTree(claims, queryClient)),
  };
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
    // BLOCKING, and the opposite of what this line used to assert: the link is NOT offered
    // once the mail goes out. Firebase keeps only the most recent password-reset oobCode
    // valid, so `sendPasswordResetEmail` above invalidated the one `actionLink` carries —
    // offering it under "si no le llega el correo" hands the Admin a link that fails with
    // auth/invalid-action-code, on the branch where the copy promises it works.
    expect(screen.queryByRole("button", { name: /Copiar enlace/ })).not.toBeInTheDocument();
    expect(screen.queryByText("https://example.com/link")).not.toBeInTheDocument();
  });

  it("sends the reset mail when beacon withholds the link (delegate caller)", async () => {
    provisionResolvesWith({ email: "ana@jci.bo", actionLink: "" });
    renderPage();
    await userEvent.click(screen.getByRole("button", { name: "Invitar acceso" }));
    await waitFor(() => expect(mockedRequestPasswordReset).toHaveBeenCalledWith("ana@jci.bo"));
    expect(await screen.findByText("Invitación enviada por correo.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Copiar enlace/ })).not.toBeInTheDocument();
  });

  // BLOCKING: the dialog now exists ONLY on the mail-failure branch, so it must say so itself.
  // Its modal `aria-hidden` takes the header alert out of the accessibility tree while it is
  // open, and a dialog that only said "comparte este enlace" left a screen-reader user with no
  // way to learn the mail had failed at all.
  it("BLOCKING: the link dialog states the mail failed, not only the header", async () => {
    provisionResolvesWith({ email: "ana@jci.bo", actionLink: "https://example.com/link" });
    mockedRequestPasswordReset.mockRejectedValue(new Error("network"));
    renderPage();
    await userEvent.click(screen.getByRole("button", { name: "Invitar acceso" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(/No se pudo enviar el correo/)).toBeInTheDocument();
    expect(within(dialog).getByText("https://example.com/link")).toBeInTheDocument();
    // The header keeps its own copy for after the dialog is dismissed. getByText, not
    // getByRole("alert"): the open modal's aria-hidden takes that alert out of the
    // accessibility tree — which is the whole reason the dialog has to say it too.
    expect(
      screen.getByText(
        "Se creó el acceso, pero no se pudo enviar el correo. Comparte el enlace manualmente.",
      ),
    ).toBeInTheDocument();
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

  // BLOCKING: the mail is INSIDE the mutation, so `isPending` covers it. It used to be a
  // floating promise the mutation did not track, so the button re-enabled the moment the
  // CALLABLE resolved and a second click could interleave — attempt one's mail resolving into
  // `sent` while attempt two's rejected into `error`, leaving the header asserting both. The
  // window is closed structurally now rather than by a `sending` flag beside it, and this is
  // what pins that: the callable has already resolved here and the button is still disabled.
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
    await userEvent.click(screen.getByRole("button", { name: "Invitar acceso" }));
    await waitFor(() => expect(mockedRequestPasswordReset).toHaveBeenCalled());
    expect(screen.getByRole("button", { name: "Generando…" })).toBeDisabled();
    await act(async () => {
      settleMail();
    });
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Invitar acceso" })).toBeEnabled(),
    );
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

  // Dismissing the dialog must make it STAY dismissed. It is `open={link !== null && !dismissed}`
  // — derived from the mutation's own data plus one flag — so a dismiss that did not set the
  // flag would leave a dialog impossible to close at all.
  it("BLOCKING: closes the link dialog, and it stays closed", async () => {
    provisionResolvesWith({ email: "ana@jci.bo", actionLink: "https://example.com/link" });
    mockedRequestPasswordReset.mockRejectedValue(new Error("network"));
    renderPage();
    await userEvent.click(screen.getByRole("button", { name: "Invitar acceso" }));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("https://example.com/link")).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.queryByText("https://example.com/link")).not.toBeInTheDocument();
  });

  // A second attempt must not re-open the dialog on the FIRST attempt's credential — an action
  // link is a bearer credential for the account. The mutation replaces `data` wholesale, and
  // `dismissed` is reset per click, so the only link that can render is the current one's.
  it("BLOCKING: a later successful invite does not resurrect the previous action link", async () => {
    provisionResolvesWith({ email: "ana@jci.bo", actionLink: "https://example.com/link" });
    mockedRequestPasswordReset.mockRejectedValue(new Error("network"));
    renderPage();
    await userEvent.click(screen.getByRole("button", { name: "Invitar acceso" }));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    mockedRequestPasswordReset.mockResolvedValue(undefined);
    await userEvent.click(screen.getByRole("button", { name: "Invitar acceso" }));
    await waitFor(() =>
      expect(screen.getByText("Invitación enviada por correo.")).toBeInTheDocument(),
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByText("https://example.com/link")).not.toBeInTheDocument();
  });
});

// Guardrail #3: loading, error and absent are three states. This page reads `positions` for two
// unrelated jobs — the cargo editors and `memberProvisionBlocked` — and BOTH treat "absent" as
// "keep waiting". On a failed query nothing ever lands, so the page silently loses the form and
// the invite button with no error and no retry anywhere.
describe("MemberProfilePage — the positions query failed", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    memberQuery.data = member();
    positionsQuery.data = undefined;
    positionsQuery.isError = true;
  });

  afterEach(() => {
    positionsQuery.data = [POWER_CARGO];
    positionsQuery.isError = false;
  });

  it("BLOCKING: says the catalog failed instead of rendering no form at all", () => {
    renderPage();
    expect(screen.getByText(/No se pudo cargar el catálogo de cargos/)).toBeInTheDocument();
  });

  // `memberProvisionBlocked` fails CLOSED on an unresolvable cargo, which is the right
  // direction — but "we could not check" must not render as "not allowed", silently.
  it("BLOCKING: tells a delegate why the invite affordance is missing", () => {
    renderPage({ roles: ["Member"], perms: ["read:Member", "create:MemberLogin"] });
    expect(screen.queryByRole("button", { name: /acceso/ })).not.toBeInTheDocument();
    expect(
      screen.getByText(/no podemos verificar si este miembro puede recibir acceso/),
    ).toBeInTheDocument();
  });

  // An Admin is subject to none of those refusals, so the failed catalog cannot mislead them —
  // the button stays, and they get the form-level notice only.
  it("still offers the invite to an Admin", () => {
    renderPage();
    expect(screen.getByRole("button", { name: "Invitar acceso" })).toBeInTheDocument();
  });
});

// A successful invite makes `memberProvisionBlocked` TRUE — beacon writes `member.uid`, and
// `hasLogin` is the first clause of the gate. So the flag that decides whether to offer the
// button flips as a RESULT of pressing it. It therefore cannot gate the mount.
describe("MemberProfilePage — InviteAccess survives its own success", () => {
  // A delegate, not an Admin: memberProvisionBlocked short-circuits to false for an Admin, so
  // the flag never flips for them and none of this is reachable.
  const DELEGATE: AuthClaims = { roles: ["Member"], perms: ["read:Member", "create:MemberLogin"] };

  beforeEach(() => {
    vi.clearAllMocks();
    mockedRequestPasswordReset.mockResolvedValue(undefined);
    memberQuery.data = member();
  });

  // BLOCKING: the whole finding. beacon created the login but the reset MAIL failed, and beacon
  // withholds the action link from a delegate — so this alert is the ONLY notice anywhere that
  // an account now exists with no password mail sent. Gating the mount on `!inviteBlocked`
  // unmounted the component on the very next refetch and deleted that notice, leaving a page
  // that looks like nothing happened, on a member who can no longer be invited.
  it("BLOCKING: keeps the mail-failure alert after `blocked` flips true", async () => {
    provisionResolvesWith({ email: "ana@jci.bo", actionLink: "" });
    mockedRequestPasswordReset.mockRejectedValue(new Error("network"));
    const { refetchMember } = renderPage(DELEGATE);

    // Not blocked yet: no uid, no grants, no seat — the button is offered.
    expect(screen.getByRole("button", { name: "Invitar acceso" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Invitar acceso" }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(
      "Se creó el acceso, pero no se pudo enviar el correo. Pídele a un administrador que lo reenvíe.",
    );

    // What beacon actually did: the member now carries a uid, so the next refetch blocks.
    memberQuery.data = member({ uid: "minted-uid" });
    refetchMember();

    // The BUTTON is gone — the callable would refuse a second attempt from this caller…
    expect(screen.queryByRole("button", { name: /acceso/ })).not.toBeInTheDocument();
    // …and the alert is STILL the same node, not a re-created one: unmounting InviteAccess
    // would have reset `error` to null and rendered nothing at all.
    expect(screen.getByRole("alert")).toBe(alert);
    expect(screen.getByRole("alert")).toHaveTextContent(/no se pudo enviar el correo/);
  });

  // The success half of the same sequence. Same unmount, same erasure — the delegate would be
  // left unable to tell a completed invite from one that never ran.
  it("BLOCKING: keeps the sent confirmation after `blocked` flips true", async () => {
    provisionResolvesWith({ email: "ana@jci.bo", actionLink: "" });
    const { refetchMember } = renderPage(DELEGATE);
    await userEvent.click(screen.getByRole("button", { name: "Invitar acceso" }));
    expect(await screen.findByText("Invitación enviada por correo.")).toBeInTheDocument();

    memberQuery.data = member({ uid: "minted-uid" });
    refetchMember();

    expect(screen.getByText("Invitación enviada por correo.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /acceso/ })).not.toBeInTheDocument();
  });

  // The control: the gate is still a gate. A member who was ALREADY provisioned before the page
  // loaded gets no button at all — `blocked` hides it on the first render too, not only after a
  // flip, so moving it off the mount did not turn it into a no-op.
  it("hides the button from the first render for an already-provisioned member", () => {
    memberQuery.data = member({ uid: "existing-uid" });
    renderPage(DELEGATE);
    expect(screen.queryByRole("button", { name: /acceso/ })).not.toBeInTheDocument();
  });

  // …and the perm gate is untouched: it still decides whether InviteAccess mounts AT ALL.
  it("mounts nothing for a caller without create:MemberLogin", () => {
    renderPage({ roles: ["Member"], perms: ["read:Member"] });
    expect(screen.queryByRole("button", { name: /acceso/ })).not.toBeInTheDocument();
  });

  // An ADMIN is never blocked, so the button stays offered as "Reenviar acceso" after the same
  // flip — the branch that proves `blocked`, not merely `member.uid`, is what hides it.
  it("keeps offering a resend to an Admin after the same flip", async () => {
    provisionResolvesWith({ email: "ana@jci.bo", actionLink: "" });
    const { refetchMember } = renderPage();
    await userEvent.click(screen.getByRole("button", { name: "Invitar acceso" }));
    expect(await screen.findByText("Invitación enviada por correo.")).toBeInTheDocument();

    memberQuery.data = member({ uid: "minted-uid" });
    refetchMember();

    expect(screen.getByRole("button", { name: "Reenviar acceso" })).toBeInTheDocument();
    expect(screen.getByText("Invitación enviada por correo.")).toBeInTheDocument();
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
