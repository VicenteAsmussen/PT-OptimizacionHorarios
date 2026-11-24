import { seguimientoDisponibilidadRepository } from "../repositories/seguimiento-disponibilidad.repository.js";
import { planificacionesSemestresService, type UsuarioPlanificacion } from "./planificaciones-semestres.service.js";
import type { AlcanceCarrera } from "../utils/alcance-carrera.js";
import { ForbiddenError } from "../utils/errors.js";
import { resumirDisponibilidadDocente } from "../utils/disponibilidad-docente.js";

export const seguimientoDisponibilidadService = {
  // Resume carga y bloques enviados de docentes gestionados para el seguimiento de secretaría.
  async get(planificacionSemestreId: number, usuario: UsuarioPlanificacion, alcance?: AlcanceCarrera) {
    if (usuario.rol !== "secretaria" || !alcance) throw new ForbiddenError("Se requiere una secretaria con carrera asociada");
    const planificacion = await planificacionesSemestresService.getById(planificacionSemestreId, alcance, usuario);
    if (!planificacion.actual) throw new ForbiddenError("El seguimiento requiere una planificación actual");
    const profesores = await seguimientoDisponibilidadRepository.profesores(planificacionSemestreId, alcance.departamentosGestionadosIds);
    return profesores.flatMap(profesor => {
      if (!alcance.departamentosGestionadosIds.includes(profesor.departamentoId)) return [];
      const asignaciones = profesor.asignaciones.filter(asignacion => asignacion.oferta.planificacionSemestreId === planificacionSemestreId);
      if (!asignaciones.length) return [];
      const horasAsignadas = asignaciones.map(asignacion =>
        asignacion.oferta.asignatura.tiposHora.find(tipo => tipo.tipoHoraId === asignacion.tipoHoraId)?.horas ?? 0);
      const { minimoBloques, bloquesEnviados } = resumirDisponibilidadDocente(horasAsignadas, profesor.disponibilidades, profesor.id, planificacionSemestreId);
      return [{ profesorId: profesor.id, nombre: profesor.nombre, departamento: profesor.departamento,
        minimoBloques, bloquesEnviados, enviada: bloquesEnviados > 0 }];
    });
  },
};
