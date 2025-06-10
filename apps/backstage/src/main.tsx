import { Toaster } from "@luminova/ui";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { lazy, StrictMode, Suspense } from "react";
import * as ReactDOM from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import { ProtectedRoute } from "./features/auth/components/ProtectedRoute";

const Dashboard = lazy(() => import("./routes/Dashboard"));
const PointRules = lazy(() => import("./routes/PointRules"));
const Events = lazy(() => import("./routes/Events"));
const MainLayout = lazy(() => import("./routes/MainLayout"));
const Members = lazy(() => import("./routes/Members"));
const Settings = lazy(() => import("./routes/Settings"));
const Allies = lazy(() => import("./routes/Allies"));
const LoginPage = lazy(() => import("./routes/Login"));

const Loading = () => <div>Loading...</div>;

const queryClient = new QueryClient();

const router = createBrowserRouter([
  {
    path: "/login",
    element: (
      <Suspense fallback={<Loading />}>
        <LoginPage />
      </Suspense>
    ),
  },
  {
    path: "/",
    element: (
      <ProtectedRoute>
        <MainLayout />
      </ProtectedRoute>
    ),
    children: [
      {
        index: true,
        element: (
          <Suspense fallback={<Loading />}>
            <Dashboard />
          </Suspense>
        ),
      },
      {
        path: "point-rules",
        element: (
          <Suspense fallback={<Loading />}>
            <PointRules />
          </Suspense>
        ),
      },
      {
        path: "members",
        element: (
          <Suspense fallback={<Loading />}>
            <Members />
          </Suspense>
        ),
      },
      {
        path: "events",
        element: (
          <Suspense fallback={<Loading />}>
            <Events />
          </Suspense>
        ),
      },
      {
        path: "allies",
        element: (
          <Suspense fallback={<Loading />}>
            <Allies />
          </Suspense>
        ),
      },
      {
        path: "settings",
        element: (
          <Suspense fallback={<Loading />}>
            <Settings />
          </Suspense>
        ),
      },
    ],
  },
]);

const root = ReactDOM.createRoot(
  document.getElementById("root") as HTMLElement,
);

root.render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
      <Toaster />
    </QueryClientProvider>
  </StrictMode>,
);
