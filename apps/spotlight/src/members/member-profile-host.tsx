import { lazy, Suspense } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";

const MemberProfileDialog = lazy(() =>
  import("./member-profile-dialog").then((m) => ({ default: m.MemberProfileDialog })),
);

export function MemberProfileHost() {
  const { miembro } = useSearch({ strict: false });
  const navigate = useNavigate();
  if (!miembro) return null;
  return (
    <Suspense fallback={null}>
      <MemberProfileDialog
        key={miembro}
        memberId={miembro}
        onClose={() =>
          void navigate({
            to: ".",
            search: (prev) => ({ ...prev, miembro: undefined }),
            resetScroll: false,
          })
        }
      />
    </Suspense>
  );
}
