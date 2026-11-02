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
  return (
    <>
      <Header />
      <main>
        <Outlet />
      </main>
      <Footer />
      <PwaUpdater />
      <PushPrompt />
      <MemberProfileHost />
    </>
  );
}
