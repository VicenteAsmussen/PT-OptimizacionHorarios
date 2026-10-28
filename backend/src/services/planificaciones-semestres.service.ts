import { planificacionesSemestresRepository } from "../repositories/planificaciones-semestres.repository.js";
import { exigirEnAlcance, type AlcanceCarrera } from "../utils/alcance-carrera.js";
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError } from "../utils/errors.js";
import type { CreatePlanificacionSemestreDTO, UpdatePlanificacionSemestreDTO } from "../validations/planificaciones-semestres.validation.js";

export type UsuarioPlanificacion = { id: number; rol: string };
export const planificacionesSemestresService = {
  async getAll(carreraId?: number, alcance?: AlcanceCarrera, usuario?: UsuarioPlanificacion) {
    if (carreraId !== undefined) exigirEnAlcance(alcance ? [alcance.carreraId] : undefined, carreraId);
    return planificacionesSemestresRepository.findAll(alcance?.carreraId ?? carreraId, usuario?.rol === "profesor" ? usuario.id : undefined);
  },
  async getById(id: number, alcance?: AlcanceCarrera, usuario?: UsuarioPlanificacion) {
    const planificacion = await planificacionesSemestresRepository.findById(id);
    if (!planificacion || (alcance && planificacion.carreraId !== alcance.carreraId)) throw new NotFoundError("Planificación de semestre no encontrada");
    if (usuario?.rol === "profesor") {
      const profesor = await planificacionesSemestresRepository.findProfesorByUsuarioId(usuario.id);
      if (!profesor || !await planificacionesSemestresRepository.profesorAutorizado(planificacion.carreraId, profesor.departamentoId)) {
        throw new ForbiddenError("El profesor no está autorizado para esta planificación");
      }
    }
    return planificacion;
  },
  async exigirAsignatura(id: number, codigo: string, alcance?: AlcanceCarrera) {
    const planificacion = await this.getById(id, alcance);
    if (!await planificacionesSemestresRepository.asignaturaPertenece(planificacion.carreraId, codigo)) throw new BadRequestError("La asignatura no pertenece a la carrera de la planificación");
    return planificacion;
  },
  async create(datos: CreatePlanificacionSemestreDTO, alcance?: AlcanceCarrera) {
    exigirEnAlcance(alcance ? [alcance.carreraId] : undefined, datos.carreraId);
    try {
      return await planificacionesSemestresRepository.create({ ...datos, actual: true, estadoPlanificacion: "preparacion" });
    } catch (error) {
      // Drizzle wraps PostgreSQL errors; translate only career/code uniqueness.
      let causa: unknown = error;
      const visitadas = new Set<unknown>();
      while (causa && typeof causa === "object" && !visitadas.has(causa)) {
        visitadas.add(causa);
        const detalle = causa as { code?: string; constraint_name?: string; constraint?: string; cause?: unknown };
        if (detalle.code === "23505" && (detalle.constraint_name ?? detalle.constraint) === "planificaciones_semestres_carrera_codigo_unique") {
          throw new ConflictError("Período existente");
        }
        causa = detalle.cause;
      }
      throw error;
    }
  },
  async update(id: number, datos: UpdatePlanificacionSemestreDTO, alcance?: AlcanceCarrera) {
    const planificacion = await this.getById(id, alcance);
    if (planificacion.estadoPlanificacion !== "preparacion" && (datos.codigo !== undefined || datos.actual === undefined)) {
      throw new ForbiddenError("La planificación ya tiene una propuesta o publicación");
    }
    if (!Object.keys(datos).length) throw new BadRequestError("No hay cambios de planificación");
    return planificacionesSemestresRepository.update(id, planificacion.carreraId, datos);
  },
  async delete(id: number, confirmacion: string, alcance?: AlcanceCarrera) {
    const planificacion = await this.getById(id, alcance);
    return planificacionesSemestresRepository.delete(id, planificacion.carreraId, confirmacion);
  },
};
