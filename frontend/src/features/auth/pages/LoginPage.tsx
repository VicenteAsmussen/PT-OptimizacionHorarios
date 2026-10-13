import { useState, type FormEvent } from "react";
import { useAuth } from "../../../hooks/useAuth";
import { ApiError } from "../../../lib/api";

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
      <section className="login-panel" aria-labelledby="login-title">
        <h1 id="login-title">Iniciar sesión</h1>
        {errorSesion && <p role="status">{errorSesion}</p>}
        {error && <p id="login-error" role="alert">{error}</p>}
        <form onSubmit={ingresar} aria-busy={enviando} aria-describedby={error ? "login-error" : undefined}>
          <label htmlFor="correo">Correo electrónico</label>
          <input id="correo" name="correo" type="email" autoComplete="username" required
            value={correo} onChange={(evento) => setCorreo(evento.target.value)} disabled={enviando} />
          <label htmlFor="clave">Contraseña</label>
          <input id="clave" name="clave" type="password" autoComplete="current-password" required
            value={clave} onChange={(evento) => setClave(evento.target.value)} disabled={enviando} />
          <button className="boton boton--azul" type="submit" disabled={enviando}>{enviando ? "Ingresando…" : "Ingresar"}</button>
        </form>
      </section>
    </main>
  );
}
