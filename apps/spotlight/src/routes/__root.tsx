import { createRootRoute, Outlet } from "@tanstack/react-router";
import { Header } from "../components/header";
import { Footer } from "../components/footer";
import { PwaUpdater } from "../components/pwa-updater";
import { PushPrompt } from "../notifications/push-prompt";
import { MemberProfileHost } from "../members/member-profile-host";
import { validateMemberSearch } from "../members/member-search";

export const Route = createRootRoute({
  validateSearch: validateMemberSearch,
  component: RootLayout,
});

function RootLayout() {
  const { miembro } = Route.useSearch();
  return (
    <>
      <Header />
      <main>
        <Outlet />
      </main>
      <Footer />
      <PwaUpdater />
      {/* The open dialog makes everything outside it inert, so the prompt could not be used. */}
      {!miembro && <PushPrompt />}
      <MemberProfileHost />
    </>
  );
}
