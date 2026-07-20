import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement, ReactNode } from "react";
import { Timestamp } from "firebase/firestore";
import type { Activity } from "@luminova/types";
import type { AuthClaims } from "@luminova/auth/roles";

function activity(over: Partial<Activity> = {}): Activity {
  return {
    id: "a1",
    termId: "2026",
    title: "Jornada Eco",
    description: null,
    location: null,
    category: "ProjectExecution",
    parentType: null,
    parentId: null,
    organizers: { directorId: null, coDirectorIds: [] },
    startAt: Timestamp.fromDate(new Date("2026-06-13T20:00:00Z")),
    endAt: null,
    photos: [],
    status: "Programada",
    ...over,
  } as Activity;
}

vi.mock("@tanstack/react-router", async (orig) => ({
  ...(await orig<typeof import("@tanstack/react-router")>()),
  getRouteApi: () => ({ useParams: () => ({ id: "a1" }) }),
  Link: (props: { to: string; children: ReactNode }) => <a href={props.to}>{props.children}</a>,
}));

const activityQuery = {
  data: activity(),
  isLoading: false,
  isError: false,
  error: null,
  refetch: vi.fn(),
};
vi.mock("../hooks/use-activity", () => ({ useActivity: () => activityQuery }));
vi.mock("../hooks/use-activity-photos", () => ({ useActivityPhotos: () => ({}) }));
vi.mock("../../members/hooks/use-members", () => ({ useMembers: () => ({ data: [] }) }));
vi.mock("../../initiatives/hooks/use-initiatives-of-type", () => ({
  useInitiativesOfType: () => ({ data: [] }),
}));
vi.mock("../../initiatives/hooks/use-initiative", () => ({
  useInitiative: () => ({ data: null, isLoading: false }),
}));
vi.mock("../hooks/use-update-activity", () => ({
  useUpdateActivity: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock("../hooks/use-cancel-activity", () => ({
  useCancelActivity: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock("../../../lib/auth/auth", () => ({
  useAuth: () => ({ user: { uid: "u" }, claims: { roles: ["Member"] } }),
}));

import { ActivityDetailPage } from "./activity-detail-page";
import { AbilityProvider } from "../../../lib/authz/ability-context";

function renderWith(claims: AuthClaims, ui: ReactElement) {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <AbilityProvider claims={claims} uid="u">
        {ui}
      </AbilityProvider>
    </QueryClientProvider>,
  );
}

describe("ActivityDetailPage — access fence", () => {
  it("fences out a signed-in principal lacking read:Activity (not a parent director)", () => {
    renderWith({ roles: ["Member"] }, <ActivityDetailPage />);
    expect(screen.getByText(/sin acceso/i)).toBeInTheDocument();
    expect(screen.queryByText(/Jornada Eco/)).not.toBeInTheDocument();
  });

  it("renders the activity for a principal with read:Activity", () => {
    renderWith({ roles: ["Member"], perms: ["read:Activity"] }, <ActivityDetailPage />);
    expect(screen.queryByText(/sin acceso/i)).not.toBeInTheDocument();
    expect(screen.getByText(/Jornada Eco/)).toBeInTheDocument();
  });
});
