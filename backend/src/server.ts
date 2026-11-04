import { app } from "./app.js";
import { env } from "./config/env.js";
import { optimizacionRepository } from "./repositories/optimizacion.repository.js";
import { cerrarOptimizacion } from "./services/optimizacion.service.js";
import { cerrarProcesosJulia } from "./optimizacion/index.js";
import { queryClient } from "./config/db.js";

const PORT = env.PORT;

const server = app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT} in ${env.NODE_ENV} mode`);
});

// No se retoman cálculos: solo se recuperan arrendamientos vencidos.
const recuperacion = setInterval(() => {
  void optimizacionRepository.recuperar().catch(() => console.error("No se pudo comprobar la recuperación de ejecuciones del modelo."));
}, 15000);
recuperacion.unref();
void optimizacionRepository.recuperar().catch(() => console.error("No se pudo comprobar la recuperación inicial del modelo."));
let cerrando = false;
async function cerrar() {
  if (cerrando) return;
  cerrando = true;
  clearInterval(recuperacion);
  server.close();
  cerrarProcesosJulia();
  await cerrarOptimizacion();
  await queryClient.end({ timeout: 5 });
  process.exit(0);
}
process.once("SIGINT", () => { void cerrar(); });
process.once("SIGTERM", () => { void cerrar(); });
