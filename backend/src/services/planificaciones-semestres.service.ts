import { planificacionesSemestresRepository } from "../repositories/planificaciones-semestres.repository.js";
import { exigirEnAlcance, type AlcanceCarrera } from "../utils/alcance-carrera.js";
import { BadRequestError, ForbiddenError, NotFoundError } from "../utils/errors.js";
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
    return planificacionesSemestresRepository.create(datos);
  },
  async update(id: number, datos: UpdatePlanificacionSemestreDTO, alcance?: AlcanceCarrera) {
    const planificacion = await this.getById(id, alcance);
    // T3 ampliará guards de entradas y transiciones. Este endpoint no reabre estados.
    if (planificacion.estadoPlanificacion !== "preparacion") throw new ForbiddenError("La planificación ya tiene una propuesta o publicación");
    if (!Object.keys(datos).length) throw new BadRequestError("No hay cambios de planificación");
    return planificacionesSemestresRepository.update(id, planificacion.carreraId, datos);
  },
};
