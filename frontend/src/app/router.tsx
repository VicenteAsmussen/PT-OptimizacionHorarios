import { createBrowserRouter, Link, Navigate } from "react-router-dom";
import AppLayout from "../components/layout/AppLayout";
import LoginPage from "../features/auth/pages/LoginPage";
import DashboardPage from "../features/dashboard/pages/DashboardPage";
import ProfesoresPage, { RequireGestionProfesores } from "../features/profesores/ProfesoresPage";
import { GuestOnly, RequireAuth } from "./AuthGuards";
import AsignaturasPage, { RequireGestionAsignaturas } from "../features/asignaturas/AsignaturasPage";
import HorariosExternosPage from "../features/horarios-externos/HorariosExternosPage";
import RequireHorariosExternos from "../features/horarios-externos/RequireHorariosExternos";
import DisponibilidadPage, { RequireDisponibilidad } from "../features/disponibilidad/DisponibilidadPage";
import MiHorarioPage, { RequireMiHorario } from "../features/mi-horario/MiHorarioPage";
import SeguimientoDisponibilidadPage, { RequireSeguimientoDisponibilidad } from "../features/seguimiento-disponibilidad/SeguimientoDisponibilidadPage";
import AdministracionPeriodosPage, { RequireAdministracionPeriodos } from "../features/administracion-periodos/AdministracionPeriodosPage";
import ResultadosHorariosPage, { RequireResultadosHorarios } from "../features/resultados-horarios/ResultadosHorariosPage";
import OptimizacionPage, { RequireOptimizacion } from "../features/optimizacion/OptimizacionPage";
import { SeguimientoOptimizacion } from "../features/optimizacion/SeguimientoOptimizacion";

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
      element: <SeguimientoOptimizacion><AppLayout /></SeguimientoOptimizacion>,
      children: [
        { index: true, element: <Navigate to="dashboard" replace /> },
        { path: "dashboard", element: <DashboardPage /> },
        { element: <RequireOptimizacion />, children: [
          { path: "optimizacion", element: <OptimizacionPage /> },
        ] },
        { element: <RequireAdministracionPeriodos />, children: [
          { path: "administracion-periodos", element: <AdministracionPeriodosPage /> },
        ] },
        { element: <RequireMiHorario />, children: [
          { path: "mi-horario", element: <MiHorarioPage /> },
        ] },
        { element: <RequireResultadosHorarios />, children: [
          { path: "resultados-horarios", element: <ResultadosHorariosPage /> },
        ] },
        { element: <RequireSeguimientoDisponibilidad />, children: [
          { path: "seguimiento-disponibilidad", element: <SeguimientoDisponibilidadPage /> },
        ] },
        { element: <RequireDisponibilidad />, children: [
          { path: "disponibilidad", element: <DisponibilidadPage /> },
        ] },
        { element: <RequireGestionProfesores />, children: [
          { path: "profesores", element: <ProfesoresPage /> },
        ] },
        { element: <RequireGestionAsignaturas />, children: [
          { path: "asignaturas", element: <AsignaturasPage /> },
        ] },
        { element: <RequireHorariosExternos />, children: [
          { path: "horarios-externos", element: <HorariosExternosPage /> },
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
