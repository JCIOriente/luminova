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
// The REAL useIssueMemberInvite runs here, with only its one edge mocked: the callable.
// Faking the hook itself is what let the "sent from a component-scoped onSuccess" bug survive
// — a hand-written fake that invokes `opts.onSuccess` unconditionally models a TanStack
// mutation that always has listeners, which is precisely the thing that is not true.
// vi.hoisted because the factories run at import time.
const { callable } = vi.hoisted(() => ({ callable: vi.fn() }));
vi.mock("firebase/functions", () => ({ httpsCallable: () => callable }));
vi.mock("@luminova/firebase/functions", () => ({ getFunctionsService: () => ({}) }));

import { MemberProfilePage } from "./member-profile-page";
import { AbilityProvider } from "../../../lib/authz/ability-context";
const TOKEN = "t".repeat(43);
const EXPIRES = new Date("2026-09-28T12:00:00Z").getTime();
/** Derived from the jsdom origin exactly as InviteAccess builds it — hardcoding a host would
 *  assert the test environment rather than the component. */
const EXPECTED_URL = `${window.location.origin}/invitacion#${TOKEN}`;

/** What beacon is pretending to return. ONE success shape: there is no mail, so there is no
 *  "sent vs fallback" knob any more. */
function inviteResolvesWith(over: Partial<Record<string, unknown>> = {}) {
  callable.mockResolvedValue({
    data: {
      email: "ana@jci.bo",
      token: TOKEN,
      expiresAt: EXPIRES,
      replacedPreviousLink: false,
      ...over,
    },
  });
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
    memberQuery.data = member();
    inviteResolvesWith();
  });

  it("shows the minted link, its expiry and the credential warning", async () => {
    // The link IS the delivery mechanism now — there is no mail to confirm, and no "fallback"
    // framing: it is always shown on success.
    renderPage();
    await userEvent.click(screen.getByRole("button", { name: "Invitar acceso" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(EXPECTED_URL)).toBeInTheDocument();
    expect(within(dialog).getByText(/28 sept 2026/)).toBeInTheDocument();
    expect(within(dialog).getByText(/chat directo, no en un grupo/i)).toBeInTheDocument();
  });

  it("calls issueMemberInvite with the member id", async () => {
    renderPage();
    await userEvent.click(screen.getByRole("button", { name: "Invitar acceso" }));
    await waitFor(() => expect(callable).toHaveBeenCalledWith({ memberId: "m1" }));
  });

  // The VISIBLE half of our advantage over a Firebase oobCode, which invalidates the
  // previously-sent code silently — with no record and no way to tell the operator. Without
  // this the advantage is only theoretical.
  it("says the previous link was revoked when one was replaced", async () => {
    inviteResolvesWith({ replacedPreviousLink: true });
    renderPage();
    await userEvent.click(screen.getByRole("button", { name: "Invitar acceso" }));
    expect(
      await screen.findByRole("heading", { name: "Enlace nuevo — el anterior fue revocado" }),
    ).toBeInTheDocument();
  });

  it("does NOT claim a revocation on a first issue", async () => {
    renderPage();
    await userEvent.click(screen.getByRole("button", { name: "Invitar acceso" }));
    expect(await screen.findByRole("heading", { name: "Enlace de acceso" })).toBeInTheDocument();
    expect(screen.queryByText(/el anterior fue revocado/)).not.toBeInTheDocument();
  });

  // BLOCKING: everything the operator must see is inside the mutation, so `isPending` covers
  // it. A step left outside used to re-enable the button the moment the callable resolved,
  // letting a second click interleave with the first attempt's tail.
  it("BLOCKING: stays disabled until the callable settles", async () => {
    let settle: (v: unknown) => void = () => {};
    callable.mockReturnValue(
      new Promise((resolve) => {
        settle = resolve;
      }),
    );
    renderPage();
    await userEvent.click(screen.getByRole("button", { name: "Invitar acceso" }));
    expect(screen.getByRole("button", { name: "Generando…" })).toBeDisabled();
    await act(async () => {
      settle({
        data: {
          email: "ana@jci.bo",
          token: TOKEN,
          expiresAt: EXPIRES,
          replacedPreviousLink: false,
        },
      });
    });
    expect(await screen.findByText(EXPECTED_URL)).toBeInTheDocument();
  });

  it("names the refusal when beacon refuses on purpose", async () => {
    // Three of beacon's guards are invisible to the client (adoption, self-heal, a privileged
    // Auth account), so a tagged refusal is the ONLY way the operator learns why — the
    // dead-end generic "no se pudo" is what the reason table exists to remove.
    callable.mockRejectedValue(
      Object.assign(new Error("denied"), {
        details: { reason: "privileged-account-requires-admin" },
      }),
    );
    renderPage();
    await userEvent.click(screen.getByRole("button", { name: "Invitar acceso" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/permisos especiales/i);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("falls back to a generic message for an untagged failure", async () => {
    callable.mockRejectedValue(new Error("network"));
    renderPage();
    await userEvent.click(screen.getByRole("button", { name: "Invitar acceso" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "No se pudo generar el enlace de acceso.",
    );
  });

  // Dismissing must make it STAY dismissed: the dialog is `open={link !== null && !dismissed}`
  // — derived from the mutation's own data plus one flag — so a dismiss that did not set the
  // flag would leave a dialog impossible to close at all.
  it("BLOCKING: closes the link dialog, and it stays closed", async () => {
    renderPage();
    await userEvent.click(screen.getByRole("button", { name: "Invitar acceso" }));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.queryByText(EXPECTED_URL)).not.toBeInTheDocument();
  });

  // BLOCKING: a second attempt must never re-open the dialog on the FIRST attempt's token — a
  // link is a bearer credential. The mutation replaces `data` wholesale and `dismissed` resets
  // per click, so only the current token can render.
  it("BLOCKING: a later invite does not resurrect the previous token", async () => {
    renderPage();
    await userEvent.click(screen.getByRole("button", { name: "Invitar acceso" }));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    const secondToken = "s".repeat(43);
    inviteResolvesWith({ token: secondToken });
    await userEvent.click(screen.getByRole("button", { name: "Invitar acceso" }));
    expect(
      await screen.findByText(`${window.location.origin}/invitacion#${secondToken}`),
    ).toBeInTheDocument();
    expect(screen.queryByText(EXPECTED_URL)).not.toBeInTheDocument();
  });

  it("renders the invite-state badge beside the action", () => {
    // A member with a uid and no projection is the ENTIRE pre-feature roster.
    renderPage();
    expect(screen.getByText("Sin invitar")).toBeInTheDocument();
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

// A successful invite used to make `memberProvisionBlocked` TRUE — beacon writes member.uid,
// and `hasLogin` was the first clause of the gate — so the flag that decided whether to offer
// the button flipped as a RESULT of pressing it. D3 removed that conjunct, so the button now
// SURVIVES its own success and relabels instead. Both halves are pinned here: the result must
// outlive the refetch, and the gate must still be a gate for the conjuncts that remain.
describe("MemberProfilePage — InviteAccess survives its own success", () => {
  // A delegate, not an Admin: memberProvisionBlocked short-circuits to false for an Admin, so
  // none of the remaining conjuncts are reachable for them.
  const DELEGATE: AuthClaims = { roles: ["Member"], perms: ["read:Member", "create:MemberLogin"] };

  beforeEach(() => {
    vi.clearAllMocks();
    memberQuery.data = member();
    inviteResolvesWith();
  });

  // BLOCKING: the link is the ONLY delivery mechanism, and beacon's write triggers a refetch
  // of the very member doc this component keys on. If that refetch unmounted or reset
  // InviteAccess, the operator would lose the token — which nothing stores in plaintext and
  // nothing can re-derive. The only remedy would be re-issuing, revoking a link they may have
  // already sent.
  it("BLOCKING: keeps the minted link visible across the refetch that follows it", async () => {
    const { refetchMember } = renderPage(DELEGATE);
    await userEvent.click(screen.getByRole("button", { name: "Invitar acceso" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(EXPECTED_URL)).toBeInTheDocument();

    // What beacon actually did: the member now carries a uid and an invite projection.
    memberQuery.data = member({ uid: "minted-uid" });
    refetchMember();

    // Same node, not a re-created one: unmounting would have dropped the token for good.
    expect(screen.getByRole("dialog")).toBe(dialog);
    expect(within(screen.getByRole("dialog")).getByText(EXPECTED_URL)).toBeInTheDocument();
  });

  it("D3: keeps offering the action to a DELEGATE after the member gains a login", async () => {
    // Before D3 the button vanished here, which is exactly how delegated recovery would have
    // shipped as dead code.
    const { refetchMember } = renderPage(DELEGATE);
    await userEvent.click(screen.getByRole("button", { name: "Invitar acceso" }));
    await screen.findByRole("dialog");
    await userEvent.keyboard("{Escape}");

    memberQuery.data = member({ uid: "minted-uid" });
    refetchMember();

    // "legacy" state — a uid with no projection — so the label becomes recovery.
    expect(screen.getByRole("button", { name: "Recuperar acceso" })).toBeInTheDocument();
  });

  // The control: the gate is STILL a gate. Only the hasLogin conjunct moved, so a delegate is
  // still refused for the conjuncts that remain.
  it("still hides the button from a delegate for a POWER-SEATED member", () => {
    memberQuery.data = member({
      uid: "existing-uid",
      positions: { [currentTermKey()]: { cargoId: POWER_CARGO.id, comisionIds: [] } },
    });
    renderPage(DELEGATE);
    expect(screen.queryByRole("button", { name: /acceso/ })).not.toBeInTheDocument();
  });

  it("still hides the button from a delegate for a member carrying direct grants", () => {
    memberQuery.data = member({ uid: "existing-uid", roleIds: ["custom"] });
    renderPage(DELEGATE);
    expect(screen.queryByRole("button", { name: /acceso/ })).not.toBeInTheDocument();
  });

  // …and the perm gate is untouched: it still decides whether InviteAccess mounts AT ALL.
  it("mounts nothing for a caller without create:MemberLogin", () => {
    renderPage({ roles: ["Member"], perms: ["read:Member"] });
    expect(screen.queryByRole("button", { name: /acceso/ })).not.toBeInTheDocument();
  });

  it("keeps offering the action to an Admin after the same flip", async () => {
    const { refetchMember } = renderPage();
    await userEvent.click(screen.getByRole("button", { name: "Invitar acceso" }));
    await screen.findByRole("dialog");
    await userEvent.keyboard("{Escape}");

    memberQuery.data = member({ uid: "minted-uid" });
    refetchMember();

    expect(screen.getByRole("button", { name: "Recuperar acceso" })).toBeInTheDocument();
  });
});

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
