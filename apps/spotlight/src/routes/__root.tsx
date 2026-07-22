import { createRootRoute, Outlet } from "@tanstack/react-router";
import { Header } from "../components/header";
import { Footer } from "../components/footer";
import { PwaUpdater } from "../components/pwa-updater";
import { PushPrompt } from "../notifications/push-prompt";

export const Route = createRootRoute({
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
    </>
  );
}
