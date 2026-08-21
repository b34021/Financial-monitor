import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter, Navigate, RouterProvider } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import './index.css'
import App from './App.tsx'
import { AddPage } from './pages/AddPage.tsx'
import { MonitorPage } from './pages/MonitorPage.tsx'

/** React Query client (cache/invalidation for server state). */
const queryClient = new QueryClient()

/** Single router definition (React Router v7) — App shell + Outlet children. */
const router = createBrowserRouter([
  {
    element: <App />,
    children: [
      { index: true, element: <Navigate to="/monitor" replace /> },
      { path: '/monitor', element: <MonitorPage /> },
      { path: '/add', element: <AddPage /> },
      { path: '*', element: <Navigate to="/monitor" replace /> },
    ],
  },
])

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
)
