import { Toaster } from '@luminova/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode, lazy, Suspense } from 'react';
import * as ReactDOM from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';

const Dashboard = lazy(() => import('./routes/Dashboard'));
const Events = lazy(() => import('./routes/Events'));
const MainLayout = lazy(() => import('./routes/MainLayout'));
const Members = lazy(() => import('./routes/Members'));
const Settings = lazy(() => import('./routes/Settings'));

const Loading = () => <div>Loading...</div>;

const queryClient = new QueryClient();

const router = createBrowserRouter([
  {
    path: '/',
    element: <MainLayout />,
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
        path: 'members',
        element: (
          <Suspense fallback={<Loading />}>
            <Members />
          </Suspense>
        ),
      },
      {
        path: 'events',
        element: (
          <Suspense fallback={<Loading />}>
            <Events />
          </Suspense>
        ),
      },
      {
        path: 'settings',
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
  document.getElementById('root') as HTMLElement,
);

root.render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
      <Toaster />
    </QueryClientProvider>
  </StrictMode>,
);
