import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Timestamp } from "firebase/firestore";
import { AbilityProvider } from "../lib/authz/ability-context";

vi.mock("../features/members/hooks/use-current-member", () => ({
  useCurrentMember: () => ({
    data: {
      id: "m1",
      name: "Ana",
      status: "Activo",
      active: true,
      uid: "self",
      profilePicture: null,
      birthdate: Timestamp.fromDate(new Date("1992-07-01T00:00:00Z")),
      joinDate: Timestamp.fromDate(new Date("2020-03-15T00:00:00Z")),
    },
    isLoading: false,
    isError: false,
  }),
}));
vi.mock("../features/members/hooks/use-members", () => ({
  useMembers: () => ({ data: [], isLoading: false, isError: false }),
}));
vi.mock("../features/members/hooks/use-member-points", () => ({
  useMemberPoints: () => ({
    data: { memberId: "m1", termId: "2026", cumulative: 7, byMonth: { "2026-06": 7 } },
  }),
}));
vi.mock("../features/members/hooks/use-member-participations", () => ({
  useMemberParticipations: () => ({ data: [] }),
}));
vi.mock("../features/members/hooks/use-member-points-by-term", () => ({
  useMemberPointsByTerm: () => ({
    data: [{ memberId: "m1", termId: "2026", cumulative: 7, byMonth: {} }],
  }),
}));
vi.mock("../features/members/hooks/use-member-photo", () => ({
  useMemberPhoto: () => ({ onUpload: vi.fn(), onRemove: vi.fn() }),
}));
vi.mock("../features/activities/hooks/use-activities-by-term", () => ({
  useActivitiesByTerm: () => ({ data: [] }),
}));
vi.mock("../features/initiatives/hooks/use-initiatives-by-term", () => ({
  useInitiativesByTerm: () => ({ data: [] }),
}));
vi.mock("../features/positions/hooks/use-positions", () => ({
  usePositions: () => ({ data: [] }),
}));
// The signed-in uid drives the self-service gate, which mirrors the rules' uid-keyed
// self lane. Mutable so a test can put a DIFFERENT uid behind the same member doc.
const auth = { uid: "self" };
vi.mock("../lib/auth/auth", () => ({
  useAuth: () => ({ user: { uid: auth.uid }, claims: { roles: ["Member"] }, loading: false }),
}));

import { MemberHome } from "../components/member-home";

function renderHome(uid: string) {
  auth.uid = uid;
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AbilityProvider claims={{ roles: ["Member"] }} uid={uid}>
        <MemberHome />
      </AbilityProvider>
    </QueryClientProvider>,
  );
}

describe("MemberHome", () => {
  it("renders points, QR and rank for the current member", () => {
    renderHome("self");
    expect(screen.getByText(/tu qr personal/i)).toBeInTheDocument();
    expect(screen.getByText("7")).toBeInTheDocument();
    expect(screen.getByText(/en el capítulo/i)).toBeInTheDocument();
    // No cargo assigned → falls back to the base role label.
    expect(screen.getAllByText("Miembro").length).toBeGreaterThan(0);
  });

  // The self-service lane offers exactly the fields the rules accept from a member —
  // and none of the institutional ones the membership tier owns.
  it("offers the self-profile form to the member whose doc it is", () => {
    renderHome("self");
    expect(screen.getByText("Mi perfil")).toBeInTheDocument();
    expect(screen.getByLabelText(/Nombre/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Teléfono/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Profesión/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Fecha de nacimiento/)).toBeInTheDocument();
    expect(screen.queryByLabelText(/Estado/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Correo/)).not.toBeInTheDocument();
  });

  // Gate keyed on doc ownership, mirroring the rules' `resource.data.uid ==
  // request.auth.uid` — NOT on a role, which would withhold the form from a principal
  // the rules would have accepted.
  it("withholds the form and the photo uploader when the doc is not the caller's", () => {
    renderHome("someone-else");
    expect(screen.queryByText("Mi perfil")).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/foto/i)).not.toBeInTheDocument();
  });
});
