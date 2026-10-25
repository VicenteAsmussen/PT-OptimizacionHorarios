import { seguimientoDisponibilidadRepository } from "../repositories/seguimiento-disponibilidad.repository.js";
import { planificacionesSemestresService, type UsuarioPlanificacion } from "./planificaciones-semestres.service.js";
import type { AlcanceCarrera } from "../utils/alcance-carrera.js";
import { ForbiddenError } from "../utils/errors.js";

export const seguimientoDisponibilidadService = {
  async get(planificacionSemestreId: number, usuario: UsuarioPlanificacion, alcance?: AlcanceCarrera) {
    if (usuario.rol !== "secretaria" || !alcance) throw new ForbiddenError("Se requiere una secretaria con carrera asociada");
    const planificacion = await planificacionesSemestresService.getById(planificacionSemestreId, alcance, usuario);
    if (!planificacion.actual) throw new ForbiddenError("El seguimiento requiere una planificación actual");
    const profesores = await seguimientoDisponibilidadRepository.profesores(planificacionSemestreId, alcance.departamentosGestionadosIds);
    return profesores.flatMap(profesor => {
      if (!alcance.departamentosGestionadosIds.includes(profesor.departamentoId)) return [];
      const asignaciones = profesor.asignaciones.filter(asignacion => asignacion.oferta.planificacionSemestreId === planificacionSemestreId);
      if (!asignaciones.length) return [];
      const minimoBloques = asignaciones.reduce((suma, asignacion) => suma +
        (asignacion.oferta.asignatura.tiposHora.find(tipo => tipo.tipoHoraId === asignacion.tipoHoraId)?.horas ?? 0), 0);
      const bloquesEnviados = new Set(profesor.disponibilidades.filter(fila =>
        fila.profesorId === profesor.id && fila.planificacionSemestreId === planificacionSemestreId).map(fila => fila.bloqueId)).size;
      return [{ profesorId: profesor.id, nombre: profesor.nombre, departamento: profesor.departamento,
        minimoBloques, bloquesEnviados, enviada: bloquesEnviados > 0 }];
    });
  },
};
