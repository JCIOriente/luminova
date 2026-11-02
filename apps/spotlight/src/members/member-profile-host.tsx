import { lazy, Suspense } from "react";
import { useLocation, useNavigate, useRouter, useSearch } from "@tanstack/react-router";
import { MemberProfileBoundary } from "./member-profile-boundary";

const MemberProfileDialog = lazy(() =>
  import("./member-profile-dialog").then((m) => ({ default: m.MemberProfileDialog })),
);

export function MemberProfileHost() {
  const { miembro } = useSearch({ strict: false });
  const navigate = useNavigate();
  const router = useRouter();
  const openedInApp = useLocation({ select: (location) => location.state.memberOverlay === true });
  if (!miembro) return null;
  // Back undoes an in-app open, so closing leaves no duplicate entry. A shared link has no
  // entry of ours to return to, so it drops the param in place instead.
  const close = () => {
    if (openedInApp) {
      router.history.back();
      return;
    }
    void navigate({
      to: ".",
      search: (prev) => ({ ...prev, miembro: undefined }),
      resetScroll: false,
      replace: true,
    });
  };
  return (
    <MemberProfileBoundary key={miembro} onClose={close}>
      <Suspense fallback={null}>
        <MemberProfileDialog key={miembro} memberId={miembro} onClose={close} />
      </Suspense>
    </MemberProfileBoundary>
  );
}
