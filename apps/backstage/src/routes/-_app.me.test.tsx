import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("../features/members/hooks/use-current-member", () => ({
  useCurrentMember: () => ({
    data: { id: "m1", name: "Ana", status: "Activo" },
    isLoading: false,
  }),
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

import { MemberHome } from "./_app.me";

describe("MemberHome", () => {
  it("renders points, QR and rank for the current member", () => {
    render(<MemberHome />);
    expect(screen.getByText(/tu qr personal/i)).toBeInTheDocument();
    expect(screen.getByText(/puesto por puntos/i)).toBeInTheDocument();
  });
});
