import { useEffect, useRef, useState } from "react";
import { Link, NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth";
import { puedeGestionarProfesores } from "../../features/profesores/permisos";
import { puedeGestionarAsignaturas } from "../../features/asignaturas/datos";
import logoUBB from "../../assets/logos/LogoUBB.png";
import iconoSalida from "../../assets/iconos/salida.svg";
import iconoRetrato from "../../assets/iconos/retrato.svg";

const consultaMovil = "(max-width: 48rem)";

export default function AppLayout() {
  const { usuario, logout } = useAuth();
  const nombreCompleto = usuario?.nombre || "Usuario";
  const nombreVisible = usuario?.nombre?.trim().split(/\s+/)[0] || "Usuario";
  const [cerrando, setCerrando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [menuUsuarioAbierto, setMenuUsuarioAbierto] = useState(false);
  const [navegacionAbierta, setNavegacionAbierta] = useState(false);
  const [esMovil, setEsMovil] = useState(() => window.matchMedia(consultaMovil).matches);
  const controlesUsuario = useRef<HTMLDivElement>(null);
  const botonUsuario = useRef<HTMLButtonElement>(null);
  const botonNavegacion = useRef<HTMLButtonElement>(null);
  const dialogoNavegacion = useRef<HTMLDialogElement>(null);
  const navegacionEscritorio = useRef<HTMLElement>(null);

  useEffect(() => {
    const consulta = window.matchMedia(consultaMovil);
    const actualizar = () => {
      setEsMovil(consulta.matches);
      setNavegacionAbierta(false);
    };
    consulta.addEventListener("change", actualizar);
    return () => consulta.removeEventListener("change", actualizar);
  }, []);

  useEffect(() => {
    if (!menuUsuarioAbierto) return;
    const cerrarFuera = (evento: Event) => {
      if (evento.target instanceof Node && !controlesUsuario.current?.contains(evento.target)) {
        setMenuUsuarioAbierto(false);
        if (evento.type === "pointerdown" && controlesUsuario.current?.contains(document.activeElement)) {
          botonUsuario.current?.focus();
        }
      }
    };
    const cerrarConEscape = (evento: KeyboardEvent) => {
      if (evento.key === "Escape") {
        evento.preventDefault();
        setMenuUsuarioAbierto(false);
        botonUsuario.current?.focus();
      }
    };
    document.addEventListener("pointerdown", cerrarFuera);
    document.addEventListener("focusin", cerrarFuera);
    document.addEventListener("keydown", cerrarConEscape);
    return () => {
      document.removeEventListener("pointerdown", cerrarFuera);
      document.removeEventListener("focusin", cerrarFuera);
      document.removeEventListener("keydown", cerrarConEscape);
    };
  }, [menuUsuarioAbierto]);

  useEffect(() => {
    const dialogo = dialogoNavegacion.current;
    if (!esMovil || !navegacionAbierta || !dialogo) return;
    const desbordamientoAnterior = document.body.style.overflow;
    // showModal mantiene el resto del documento inerte y contiene el foco.
    dialogo.showModal();
    document.body.style.overflow = "hidden";
    return () => {
      dialogo.close();
      document.body.style.overflow = desbordamientoAnterior;
      if (window.matchMedia(consultaMovil).matches) {
        botonNavegacion.current?.focus();
      } else {
        navegacionEscritorio.current?.querySelector<HTMLAnchorElement>("a")?.focus();
      }
    };
  }, [esMovil, navegacionAbierta]);

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

  const navegacion = (
    <>
      <p className="sidebar-title" id="titulo-navegacion">Horarios académicos</p>
      <nav aria-label="Navegación principal">
        <NavLink to="/app/dashboard" end onClick={() => setNavegacionAbierta(false)}>
          Panel principal
        </NavLink>
        {puedeGestionarAsignaturas(usuario?.rol) && (
          <NavLink to="/app/asignaturas" onClick={() => setNavegacionAbierta(false)}>
            Asignaturas
          </NavLink>
        )}
        {puedeGestionarProfesores(usuario?.rol) && (
          <NavLink to="/app/profesores" onClick={() => setNavegacionAbierta(false)}>
            Profesores
          </NavLink>
        )}
        {puedeGestionarAsignaturas(usuario?.rol) && (
          <NavLink to="/app/horarios-externos" onClick={() => setNavegacionAbierta(false)}>
            Horarios departamentos externos
          </NavLink>
        )}
      </nav>
    </>
  );

  return (
    <div className="app-layout">
      <header className="topbar">
        <div className="topbar-institucion">
          <button
            ref={botonNavegacion}
            className="topbar-icono boton-navegacion"
            type="button"
            aria-label="Abrir navegación principal"
            aria-expanded={navegacionAbierta}
            aria-controls="navegacion-movil"
            aria-haspopup="dialog"
            onClick={() => {
              setMenuUsuarioAbierto(false);
              setNavegacionAbierta(true);
            }}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16" /></svg>
          </button>
          <Link className="topbar-enlace-institucion" to="/app/dashboard" aria-label="Universidad del Bío-Bío: ir al inicio">
            <img className="topbar-logo" src={logoUBB} alt="" />
            <span className="topbar-nombre-institucion" aria-hidden="true">Universidad del Bío-Bío</span>
          </Link>
        </div>
        <p className="topbar-titulo">Sistema de Optimización de Horarios Académicos</p>
        <div className="session-controls" ref={controlesUsuario}>
          <button
            ref={botonUsuario}
            className="boton-usuario"
            type="button"
            aria-label={`Opciones de usuario: ${nombreCompleto}`}
            title={nombreCompleto}
            aria-expanded={menuUsuarioAbierto}
            aria-controls="opciones-usuario"
            onClick={() => setMenuUsuarioAbierto(!menuUsuarioAbierto)}
          >
            <img className="topbar-retrato" src={iconoRetrato} alt="" aria-hidden="true" />
            <span className="topbar-texto-usuario">
              <span className="topbar-saludo-usuario">Bienvenid@</span>
              <span className="topbar-nombre-usuario">{nombreVisible}</span>
            </span>
          </button>
          <div className="usuario-panel" hidden={!menuUsuarioAbierto && !error}>
            <div id="opciones-usuario" hidden={!menuUsuarioAbierto}>
              <button className="usuario-salir" type="button" onClick={cerrarSesion} disabled={cerrando}>
                <img src={iconoSalida} alt="" aria-hidden="true" />
                {cerrando ? "Saliendo…" : "Salir"}
              </button>
            </div>
            {error && <p className="usuario-error" role="alert">{error}</p>}
          </div>
        </div>
      </header>
      {esMovil ? (
        <dialog
          ref={dialogoNavegacion}
          id="navegacion-movil"
          className="sidebar sidebar--movil"
          aria-labelledby="titulo-navegacion"
          onCancel={() => setNavegacionAbierta(false)}
          onClick={(evento) => {
            if (evento.target !== evento.currentTarget) return;
            const limites = evento.currentTarget.getBoundingClientRect();
            if (evento.clientX < limites.left || evento.clientX > limites.right ||
                evento.clientY < limites.top || evento.clientY > limites.bottom) {
              setNavegacionAbierta(false);
            }
          }}
        >
          <button className="topbar-icono cerrar-navegacion" type="button"
            aria-label="Cerrar navegación principal" onClick={() => setNavegacionAbierta(false)}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg>
          </button>
          {navegacion}
        </dialog>
      ) : (
        <aside className="sidebar" ref={navegacionEscritorio}>{navegacion}</aside>
      )}
      <div className="app-body">
        <main className="main-content"><Outlet /></main>
      </div>
    </div>
  );
}
