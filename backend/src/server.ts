import { createServer } from "node:http";
import { app } from "./app.js";
import { env } from "./config/env.js";
import { optimizacionRepository } from "./repositories/optimizacion.repository.js";
import { cerrarOptimizacion } from "./services/optimizacion.service.js";
import { cerrarProcesosJulia } from "./optimizacion/index.js";
import { queryClient } from "./config/db.js";
import { crearApagado } from "./utils/apagado.js";

const PORT = env.PORT;

const recuperaciones = new Set<Promise<void>>();
const servidor = createServer((solicitud, respuesta) => {
  if (apagado.estaCerrando()) {
    respuesta.writeHead(503, { Connection: "close", "Content-Type": "text/plain; charset=utf-8" });
    respuesta.end("El servidor está cerrando.");
    return;
  }
  app(solicitud, respuesta);
});
const apagado = crearApagado({
  servidor,
  detenerRecuperacion: async () => {
    clearInterval(recuperacion);
    await Promise.all([...recuperaciones]);
  },
  cerrarJulia: cerrarProcesosJulia,
  cerrarOptimizacion,
  cerrarSql: () => queryClient.end({ timeout: 5 }),
  salir: codigo => { process.exit(codigo); },
  informar: mensaje => console.error(mensaje),
});

servidor.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT} in ${env.NODE_ENV} mode`);
});

// No se retoman cálculos: solo se recuperan arrendamientos vencidos.
function recuperar(mensaje: string) {
  if (apagado.estaCerrando()) return;
  const tarea = (async () => {
    try { await optimizacionRepository.recuperar(); }
    catch { console.error(mensaje); }
  })();
  recuperaciones.add(tarea);
  void tarea.then(() => { recuperaciones.delete(tarea); });
}
const recuperacion = setInterval(() => {
  recuperar("No se pudo comprobar la recuperación de ejecuciones del modelo.");
}, 15000);
recuperacion.unref();
recuperar("No se pudo comprobar la recuperación inicial del modelo.");
function cerrarPorSenal() {
  void apagado.cerrar().catch(() => {
    console.error("No se pudo completar el apagado del servidor.");
    process.exit(1);
  });
}
process.on("SIGINT", cerrarPorSenal);
process.on("SIGTERM", cerrarPorSenal);
