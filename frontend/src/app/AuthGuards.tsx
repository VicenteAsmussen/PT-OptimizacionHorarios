import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";

// Indica que aún no se ha resuelto el acceso a las pantallas académicas.
function CargandoSesion() {
  return <main className="standalone-page" role="status">Comprobando sesión…</main>;
}

// Reserva las rutas de trabajo para una cuenta con sesión restaurada.
export function RequireAuth() {
  const { usuario, cargando } = useAuth();
  if (cargando) return <CargandoSesion />;
  return usuario ? <Outlet /> : <Navigate to="/login" replace />;
}

// Evita presentar el ingreso a quien ya tiene una sesión activa.
export function GuestOnly() {
  const { usuario, cargando } = useAuth();
  if (cargando) return <CargandoSesion />;
  return usuario ? <Navigate to="/app/dashboard" replace /> : <Outlet />;
}
