import { createRootRoute, Outlet } from "@tanstack/react-router";
import { Header } from "../components/header";
import { Footer } from "../components/footer";

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
    </>
  );
}
