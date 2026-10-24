import { miDisponibilidadRepository } from "../repositories/mi-disponibilidad.repository.js";
import { planificacionesSemestresRepository } from "../repositories/planificaciones-semestres.repository.js";
import { BadRequestError, ConflictError, ForbiddenError } from "../utils/errors.js";
import type { UsuarioPlanificacion } from "./planificaciones-semestres.service.js";

async function profesorPropio(usuario: UsuarioPlanificacion, profesorId?: number) {
  if (usuario.rol !== "profesor") throw new ForbiddenError("Esta función es exclusiva para profesores");
  const profesor = await planificacionesSemestresRepository.findProfesorByUsuarioId(usuario.id);
  if (!profesor) throw new ForbiddenError("No existe un perfil de profesor asociado");
  if (profesorId !== undefined && profesorId !== profesor.id) throw new ForbiddenError("Solo puede gestionar su propia disponibilidad");
  return profesor.id;
}
export const miDisponibilidadService = {
  async get(usuario: UsuarioPlanificacion, planificacionSemestreId?: number, incluirAnteriores = false) {
    const profesorId = await profesorPropio(usuario);
    const contexto = await miDisponibilidadRepository.contexto(profesorId, undefined, incluirAnteriores);
    return { planificaciones: contexto.planificaciones, bloques: contexto.bloques,
      seleccion: planificacionSemestreId === undefined ? null : contexto.seleccion(planificacionSemestreId) };
  },
  async modificar(usuario: UsuarioPlanificacion, planificacionSemestreId: number,
    cambio: { bloquesIds: number[] } | { agregar: number } | { quitar: number }, profesorId?: number) {
    const propioId = await profesorPropio(usuario, profesorId);
    return miDisponibilidadRepository.modificar(propioId, planificacionSemestreId, (seleccion, bloques) => {
      if (!seleccion.editable) throw new ForbiddenError("Solo se puede modificar disponibilidad en una planificación actual en preparación");
      if (seleccion.minimoBloques <= 0) throw new ForbiddenError("No tiene carga docente positiva en esta planificación");
      if ("agregar" in cambio && seleccion.bloquesIds.includes(cambio.agregar)) throw new ConflictError("El profesor ya tiene disponibilidad en ese bloque y planificación");
      const propuesta = "bloquesIds" in cambio ? cambio.bloquesIds : "agregar" in cambio ? [...seleccion.bloquesIds, cambio.agregar] : seleccion.bloquesIds.filter(id => id !== cambio.quitar);
      const unicos = [...new Set(propuesta)].sort((a, b) => a - b);
      if (!unicos.length) throw new BadRequestError("Debe seleccionar al menos un bloque de disponibilidad");
      if (unicos.some(id => !bloques.some(bloque => bloque.id === id))) throw new BadRequestError("Hay bloques horarios inexistentes");
      if (unicos.length < seleccion.minimoBloques) throw new BadRequestError(`Debe seleccionar al menos ${seleccion.minimoBloques} bloques de disponibilidad`);
      return unicos;
    });
  },
};
