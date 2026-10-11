import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";

function CargandoSesion() {
  return <main className="standalone-page" role="status">Comprobando sesión…</main>;
}

export function RequireAuth() {
  const { usuario, cargando } = useAuth();
  if (cargando) return <CargandoSesion />;
  return usuario ? <Outlet /> : <Navigate to="/login" replace />;
}

export function GuestOnly() {
  const { usuario, cargando } = useAuth();
  if (cargando) return <CargandoSesion />;
  return usuario ? <Navigate to="/app/dashboard" replace /> : <Outlet />;
}
