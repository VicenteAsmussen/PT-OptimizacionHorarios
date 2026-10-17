interface Avisos {
  exito: (mensaje: string, id?: string | number) => string | number;
  advertencia: (mensaje: string, id?: string | number) => string | number;
  cerrar: (id: string | number) => unknown;
}

// Solo gestiona el aviso de una escritura; nunca ejecuta ni reintenta solicitudes.
export function crearNotificacionesProfesores(avisos: Avisos) {
  let id: string | number | undefined;
  let pendiente = false;
  return {
    guardado(vigente: () => boolean) {
      if (!vigente()) return;
      if (id !== undefined) avisos.cerrar(id);
      id = avisos.exito("Cambios guardados. Actualizando la lista…");
      pendiente = true;
    },
    resultado(exito: boolean, vigente: () => boolean) {
      if (!vigente() || !pendiente || id === undefined) return;
      if (exito) {
        avisos.exito("Cambios guardados. Lista actualizada.", id);
        pendiente = false;
      } else {
        avisos.advertencia("Cambios guardados, pero no se pudo actualizar la lista.", id);
      }
    },
    limpiar() {
      if (id !== undefined) avisos.cerrar(id);
      id = undefined;
      pendiente = false;
    },
  };
}
