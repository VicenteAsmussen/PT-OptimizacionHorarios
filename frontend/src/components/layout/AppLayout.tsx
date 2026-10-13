import { useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth";

export default function AppLayout() {
  const { usuario, logout } = useAuth();
  const [cerrando, setCerrando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function cerrarSesion() {
    if (cerrando) return;
    setCerrando(true);
    setError(null);
    try {
      await logout();
    } catch {
      setError("No se pudo cerrar la sesión. Inténtalo nuevamente.");
    } finally {
      setCerrando(false);
    }
  }

  return (
    <div className="app-layout">
      <header className="topbar">
        <span>Sistema de Optimización de Horarios Académicos</span>
        <div className="session-controls">
          {usuario && <span>{usuario.nombre} · {usuario.rol}</span>}
          <button className="boton boton--gris" type="button" onClick={cerrarSesion} disabled={cerrando}>
            {cerrando ? "Cerrando sesión…" : "Cerrar sesión"}
          </button>
          {error && <p role="alert">{error}</p>}
        </div>
      </header>
      <aside className="sidebar">
        <p className="sidebar-title">Horarios académicos</p>
        <nav aria-label="Navegación principal">
          <NavLink to="/app/dashboard" end>Panel principal</NavLink>
        </nav>
      </aside>
      <div className="app-body">
        <main className="main-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
