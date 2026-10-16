import { createBrowserRouter, Link, Navigate } from "react-router-dom";
import AppLayout from "../components/layout/AppLayout";
import LoginPage from "../features/auth/pages/LoginPage";
import DashboardPage from "../features/dashboard/pages/DashboardPage";
import ProfesoresPage, { RequireGestionProfesores } from "../features/profesores/ProfesoresPage";
import { GuestOnly, RequireAuth } from "./AuthGuards";

export const router = createBrowserRouter([
  { path: "/", element: <Navigate to="/login" replace /> },
  {
    element: <GuestOnly />,
    children: [{ path: "/login", element: <LoginPage /> }],
  },
  {
    path: "/app",
    element: <RequireAuth />,
    children: [{
      element: <AppLayout />,
      children: [
        { index: true, element: <Navigate to="dashboard" replace /> },
        { path: "dashboard", element: <DashboardPage /> },
        { element: <RequireGestionProfesores />, children: [
          { path: "profesores", element: <ProfesoresPage /> },
        ] },
        { path: "*", element: <p>Página no encontrada</p> },
      ],
    }],
  },
  {
    path: "*",
    element: (
      <main className="standalone-page">
        <h1>Página no encontrada</h1>
        <Link to="/login">Volver al inicio</Link>
      </main>
    ),
  },
]);
