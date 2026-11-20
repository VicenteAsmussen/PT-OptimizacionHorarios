interface OpcionesApagado {
  servidor: {
    close: (callback: (error?: Error) => void) => unknown;
    closeIdleConnections: () => void;
    closeAllConnections: () => void;
  };
  detenerRecuperacion: () => void | Promise<void>;
  cerrarJulia: () => void;
  cerrarOptimizacion: () => Promise<void>;
  cerrarSql: () => Promise<void>;
  salir: (codigo: number) => void;
  informar: (mensaje: string) => void;
}

// Coordina un cierre único del servidor y sus recursos con un tiempo máximo de espera.
export function crearApagado(opciones: OpcionesApagado, limiteMs = 30000) {
  let cerrando = false;
  let tarea: Promise<void> | undefined;

  // Espera el cierre de solicitudes HTTP y tareas antes de liberar la conexión SQL.
  async function ejecutar() {
    let fallo = false;
    let vencido = false;
    // Registra un cierre incompleto para que el proceso termine con estado de error.
    const informarFallo = (mensaje: string) => { fallo = true; opciones.informar(mensaje); };
    // Continúa el apagado tras informar el fallo de una liberación de recursos.
    const intentar = async (operacion: () => void | Promise<void>, mensaje: string) => {
      try { await operacion(); } catch { informarFallo(mensaje); }
    };
    let temporizador: ReturnType<typeof setTimeout>;
    const limite = new Promise<void>(resolve => {
      temporizador = setTimeout(() => {
        vencido = true;
        informarFallo("Se agotó el tiempo de apagado del servidor.");
        try { opciones.servidor.closeAllConnections(); }
        catch { informarFallo("No se pudieron cerrar las conexiones HTTP activas."); }
        resolve();
      }, limiteMs);
      temporizador.unref();
    });

    // Espera las solicitudes admitidas y detiene el trabajo de optimización antes de SQL.
    async function finalizar() {
      const drenaje = new Promise<void>(resolve => {
        try {
          opciones.servidor.close(error => {
            if (error) informarFallo("No se pudo cerrar el servidor HTTP.");
            resolve();
          });
        } catch { informarFallo("No se pudo cerrar el servidor HTTP."); resolve(); }
        // Después de close, nunca antes, para no admitir conexiones entre ambos pasos.
        try { opciones.servidor.closeIdleConnections(); }
        catch { informarFallo("No se pudieron cerrar las conexiones HTTP ociosas."); }
      });
      const recuperacion = intentar(opciones.detenerRecuperacion, "No se pudo detener la recuperación del modelo.");
      await drenaje;
      if (vencido) return;
      await recuperacion;
      if (vencido) return;
      await intentar(opciones.cerrarJulia, "No se pudieron cerrar los procesos Julia.");
      if (vencido) return;
      await intentar(opciones.cerrarOptimizacion, "No se pudo cerrar la optimización.");
      if (vencido) return;
      await intentar(opciones.cerrarSql, "No se pudo cerrar la conexión SQL.");
    }

    // El mismo límite impide quedar esperando recuperaciones o recursos bloqueados.
    // Al vencer se sale con error, sin cerrar SQL bajo solicitudes o tareas pendientes.
    try { await Promise.race([finalizar(), limite]); }
    finally { clearTimeout(temporizador!); }
    opciones.salir(fallo ? 1 : 0);
  }

  return {
    // Permite rechazar nuevas solicitudes mientras terminan las ya admitidas.
    estaCerrando: () => cerrando,
    // Reutiliza la misma promesa de cierre ante señales repetidas.
    cerrar: () => {
      cerrando = true;
      tarea ??= ejecutar();
      return tarea;
    },
  };
}
