import { createFileRoute } from "@tanstack/react-router";
import { Skeleton } from "@luminova/ui";
import { useAuth } from "../lib/auth/auth";
import { useMembers } from "../features/members/hooks/use-members";
import { useAllies } from "../features/allies/hooks/use-allies";
import { OverviewView } from "../components/overview/overview-view";

export const Route = createFileRoute("/_app/")({
  component: DashboardPage,
});

function DashboardPage() {
  const { user } = useAuth();
  const members = useMembers();
  const allies = useAllies();

  if (members.isLoading || allies.isLoading) {
    return (
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-[120px]" />
        ))}
      </div>
    );
  }

  const memberCount = members.data?.filter((m) => m.active).length ?? 0;
  const allyCount = allies.data?.length ?? 0;

  return (
    <OverviewView
      memberCount={memberCount}
      allyCount={allyCount}
      userName={user?.email ?? "—"}
    />
  );
}
