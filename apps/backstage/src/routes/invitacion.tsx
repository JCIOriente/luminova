import { createFileRoute, useLocation } from "@tanstack/react-router";
import { AuthScreen } from "../features/auth/components/auth-screen";
import { BrandSide } from "../features/auth/components/brand-side";
import { InviteRedeemForm } from "../features/auth/components/invite-redeem-form";

/** A TOP-LEVEL route, deliberately NOT under the `_auth` layout.
 *
 *  `_auth.tsx`'s beforeLoad redirects any authenticated visitor to `/`. Under `_auth`, an
 *  operator who opens the link they just generated — the only way to sanity-check it, now
 *  that no mail exists — would land silently on the dashboard with no signal about whether
 *  the link works. For a feature whose sole delivery mechanism is a human pasting a URL into
 *  WhatsApp, "the operator cannot verify the artifact they just produced" is a product
 *  defect. Redeeming a token is orthogonal to whether the visitor is signed in, and
 *  AuthScreen / BrandSide are plain components rather than a route layout, so there is no
 *  guard to re-implement.
 *
 *  THIS FILE EXPORTS `Route` AND NOTHING ELSE. `autoCodeSplitting` is on; a second export
 *  switches it off for this file and drags the whole import graph into the entry chunk —
 *  docs/performance.md:133 records exactly that regression on /me. */
export const Route = createFileRoute("/invitacion")({
  component: InvitePage,
});

function InvitePage() {
  // The token rides in the FRAGMENT so it never reaches a server log or a Referer header.
  // `hash` is a typed first-class field of ParsedLocation ("excluding the leading hash
  // character") — no validateSearch, no window.location reach-around.
  const hash = useLocation({ select: (l) => l.hash });
  return (
    <AuthScreen
      brand={
        <BrandSide
          tone="blue"
          eyebrow="Bienvenido"
          title={
            <>
              Ya casi <b className="font-semibold">estás dentro.</b>
            </>
          }
          lead="Elige una contraseña segura para entrar a la plataforma de la directiva."
        />
      }
    >
      <InviteRedeemForm token={hash} />
    </AuthScreen>
  );
}
