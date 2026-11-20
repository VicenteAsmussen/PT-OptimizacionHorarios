interface Avisos {
  exito: (mensaje: string, id?: string | number) => string | number;
  advertencia: (mensaje: string, id?: string | number) => string | number;
  cerrar: (id: string | number) => unknown;
}

// Solo gestiona el aviso de guardado, nunca ejecuta ni reintenta solicitudes.
// Coordina el aviso de guardado docente con el resultado posterior de la recarga.
export function crearNotificacionesProfesores(avisos: Avisos) {
  let id: string | number | undefined;
  let pendiente = false;
  return {
    // Confirma la escritura sin dar por actualizada todavía la lista docente.
    guardado(vigente: () => boolean) {
      if (!vigente()) return;
      if (id !== undefined) avisos.cerrar(id);
      id = avisos.exito("Cambios guardados. Actualizando la lista…");
      pendiente = true;
    },
    // Diferencia una lista renovada de un guardado cuya recarga falló.
    resultado(exito: boolean, vigente: () => boolean) {
      if (!vigente() || !pendiente || id === undefined) return;
      if (exito) {
        avisos.exito("Cambios guardados. Lista actualizada.", id);
        pendiente = false;
      } else {
        avisos.advertencia("Cambios guardados, pero no se pudo actualizar la lista.", id);
      }
    },
    // Retira el aviso pendiente cuando deja de corresponder al catálogo visible.
    limpiar() {
      if (id !== undefined) avisos.cerrar(id);
      id = undefined;
      pendiente = false;
    },
  };
}
