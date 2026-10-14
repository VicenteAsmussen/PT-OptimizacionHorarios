import { useState, type FormEvent } from "react";
import { useAuth } from "../../../hooks/useAuth";
import { ApiError } from "../../../lib/api";
import logoUniversidad from "../../../assets/logos/logo_universidad.png";
import iconoUsuario from "../../../assets/iconos/usuario.svg";
import iconoCandado from "../../../assets/iconos/candado.svg";
import iconoLlave from "../../../assets/iconos/llave.svg";

export default function LoginPage() {
  const { login, errorSesion } = useAuth();
  const [correo, setCorreo] = useState("");
  const [clave, setClave] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function ingresar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (enviando) return;
    setError(null);
    setEnviando(true);
    try {
      await login({ correo: correo.trim(), clave });
    } catch (fallo: unknown) {
      setError(fallo instanceof ApiError ? fallo.message : "No se pudo conectar con el servidor. Inténtalo nuevamente.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <main className="login-page">
      <div className="login-decoraciones" aria-hidden="true">
        <span className="login-figura login-figura--circulo login-figura--uno" />
        <span className="login-figura login-figura--triangulo login-figura--dos" />
        <span className="login-figura login-figura--cuadrado login-figura--tres" />
        <span className="login-figura login-figura--circulo login-figura--cuatro" />
        <span className="login-figura login-figura--triangulo login-figura--cinco" />
        <span className="login-figura login-figura--cuadrado login-figura--seis" />
        <span className="login-figura login-figura--circulo login-figura--siete" />
        <span className="login-figura login-figura--cuadrado login-figura--ocho" />
        <span className="login-figura login-figura--triangulo login-figura--nueve" />
        <span className="login-figura login-figura--circulo login-figura--diez" />
        <span className="login-figura login-figura--cuadrado login-figura--once" />
        <span className="login-figura login-figura--circulo login-figura--doce" />
        <span className="login-figura login-figura--triangulo login-figura--trece" />
        <span className="login-figura login-figura--cuadrado login-figura--catorce" />
        <span className="login-figura login-figura--circulo login-figura--quince" />
        <span className="login-figura login-figura--triangulo login-figura--dieciseis" />
      </div>
      <div className="login-contenido">
        <img className="login-logo" src={logoUniversidad} alt="Universidad del Bío-Bío" />
        <section className="login-panel" aria-labelledby="login-title">
          <h1 id="login-title">Sistema de Optimización de Horarios Académicos</h1>
          <p className="login-subtitulo">Iniciar sesión</p>
          {errorSesion && <p role="status">{errorSesion}</p>}
          {error && <p id="login-error" role="alert">{error}</p>}
          <form onSubmit={ingresar} aria-busy={enviando} aria-describedby={error ? "login-error" : undefined}>
            <div className="login-campo">
              <label className="login-etiqueta-oculta" htmlFor="correo">Correo electrónico</label>
              <input id="correo" name="correo" type="email" autoComplete="username" required
                placeholder="Correo electrónico"
                value={correo} onChange={(evento) => setCorreo(evento.target.value)} disabled={enviando} />
              <img className="login-icono-campo" src={iconoUsuario} alt="" aria-hidden="true" />
            </div>
            <div className="login-campo">
              <label className="login-etiqueta-oculta" htmlFor="clave">Contraseña</label>
              <input id="clave" name="clave" type="password" autoComplete="current-password" required
                placeholder="Contraseña"
                value={clave} onChange={(evento) => setClave(evento.target.value)} disabled={enviando} />
              <img className="login-icono-campo" src={iconoCandado} alt="" aria-hidden="true" />
            </div>
            <button className="boton boton--azul login-boton" type="submit" disabled={enviando}>
              <img className="login-icono-boton" src={iconoLlave} alt="" aria-hidden="true" />
              {enviando ? "Ingresando…" : "Ingresar"}
            </button>
          </form>
        </section>
      </div>
    </main>
  );
}
