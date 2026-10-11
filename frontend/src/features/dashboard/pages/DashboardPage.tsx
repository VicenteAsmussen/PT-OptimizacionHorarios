export default function DashboardPage() {
  return (
    <section aria-labelledby="dashboard-title">
      <h1 id="dashboard-title">Panel principal</h1>
      <p>Resumen de planificación académica. Los datos estarán disponibles próximamente.</p>
      <div className="summary-grid">
        <article className="summary-card">
          <h2>Asignaturas</h2>
          <p>Sin datos</p>
        </article>
        <article className="summary-card">
          <h2>Profesores</h2>
          <p>Sin datos</p>
        </article>
        <article className="summary-card">
          <h2>Salas</h2>
          <p>Sin datos</p>
        </article>
        <article className="summary-card">
          <h2>Horarios</h2>
          <p>Sin datos</p>
        </article>
      </div>
    </section>
  );
}
