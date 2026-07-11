import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { Timestamp } from "firebase/firestore";

vi.mock("../features/members/hooks/use-current-member", () => ({
  useCurrentMember: () => ({
    data: {
      id: "m1",
      name: "Ana",
      status: "Activo",
      active: true,
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

import { MemberHome } from "./_app.me";

describe("MemberHome", () => {
  it("renders points, QR and rank for the current member", () => {
    render(<MemberHome />);
    expect(screen.getByText(/tu qr personal/i)).toBeInTheDocument();
    expect(screen.getByText("7")).toBeInTheDocument();
    expect(screen.getByText(/en el capítulo/i)).toBeInTheDocument();
    // No cargo assigned → falls back to the base role label.
    expect(screen.getAllByText("Miembro").length).toBeGreaterThan(0);
  });
});
