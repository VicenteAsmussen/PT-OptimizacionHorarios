import { Link } from "react-router-dom";

export default function LoginPage() {
  return (
    <main className="login-page">
      <section className="login-panel" aria-labelledby="login-title">
        <h1 id="login-title">Iniciar sesión</h1>
        <p>Formulario de demostración. La autenticación aún no está disponible.</p>
        <form onSubmit={(evento) => evento.preventDefault()}>
          <label htmlFor="email">Correo electrónico</label>
          <input id="email" name="email" type="email" autoComplete="username" />
          <label htmlFor="password">Contraseña</label>
          <input id="password" name="password" type="password" autoComplete="current-password" />
          <button type="submit" disabled>Ingresar (próximamente)</button>
        </form>
        <Link to="/app/dashboard">Ver panel de demostración</Link>
      </section>
    </main>
  );
}
