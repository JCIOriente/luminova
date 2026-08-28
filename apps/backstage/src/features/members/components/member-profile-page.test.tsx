import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
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

  it("points at the manual link when the mail fails but a link came back", async () => {
    provisionResolvesWith({ email: "ana@jci.bo", actionLink: "https://example.com/link" });
    mockedRequestPasswordReset.mockRejectedValue(new Error("network"));
    renderPage();
    await userEvent.click(screen.getByRole("button", { name: "Invitar acceso" }));
    // findByText, not findByRole("alert"): the link dialog is open on top, and its modal
    // aria-hidden takes the header's alert out of the accessibility tree while it is.
    expect(
      await screen.findByText(
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
