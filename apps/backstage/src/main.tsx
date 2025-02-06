import { StrictMode } from 'react';
import * as ReactDOM from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import App from './app/app';
import MainLayout from './routes/MainLayout';
import Dashboard from './routes/Dashboard';
import Members from './routes/Members';
import Events from './routes/Events';
import Settings from './routes/Settings';

const router = createBrowserRouter([
  {
    path: '/',
    element: <MainLayout />,
    children: [
      {
        index: true,
        element: <Dashboard />,
      },
      {
        path: 'members',
        element: <Members />,
      },
      {
        path: 'events',
        element: <Events />,
      },
      {
        path: 'settings',
        element: <Settings />,
      },
    ],
  },
]);

const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement
);

root.render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>
);
