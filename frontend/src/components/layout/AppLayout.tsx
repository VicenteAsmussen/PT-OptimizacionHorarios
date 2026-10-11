import { NavLink, Outlet } from "react-router-dom";

export default function AppLayout() {
  return (
    <div className="app-layout">
      <aside className="sidebar">
        <p className="sidebar-title">Horarios académicos</p>
        <nav aria-label="Navegación principal">
          <NavLink to="/app/dashboard" end>Panel principal</NavLink>
        </nav>
      </aside>
      <div className="app-body">
        <header className="topbar">
          <span>Sistema de Optimización de Horarios Académicos</span>
          <span>Prototipo</span>
        </header>
        <main className="main-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
