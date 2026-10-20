import { exigirEnAlcance, type AlcanceCarrera } from "../utils/alcance-carrera.js";
import { disponibilidadRepository } from "../repositories/disponibilidad.repository.js";
import { planificacionesSemestresRepository } from "../repositories/planificaciones-semestres.repository.js";
import { planificacionesSemestresService, type UsuarioPlanificacion } from "./planificaciones-semestres.service.js";
import type { CreateDisponibilidadDTO, SyncDisponibilidadDTO, DisponibilidadQueryDTO } from "../validations/disponibilidad.validation.js";
import { NotFoundError, ConflictError, BadRequestError, ForbiddenError } from "../utils/errors.js";

async function exigirProfesorPropio(profesorId: number, usuario?: UsuarioPlanificacion) {
  if (usuario?.rol !== "profesor") return;
  const profesor = await planificacionesSemestresRepository.findProfesorByUsuarioId(usuario.id);
  if (!profesor || profesor.id !== profesorId) throw new ForbiddenError("Solo puede gestionar su propia disponibilidad");
}
async function exigirEditable(planificacionSemestreId: number, alcance?: AlcanceCarrera, usuario?: UsuarioPlanificacion) {
  const planificacion = await planificacionesSemestresService.getById(planificacionSemestreId, alcance, usuario);
  if (!planificacion.actual || planificacion.estadoPlanificacion !== "preparacion") {
    throw new ForbiddenError("Solo se puede modificar disponibilidad en una planificación actual en preparación");
  }
  // El repositorio vuelve a validar el estado bajo el bloqueo de carrera.
}
export const disponibilidadService = {
  async getDisponibilidad(consulta?: DisponibilidadQueryDTO, alcance?: AlcanceCarrera, usuario?: UsuarioPlanificacion) {
    let filtro = consulta;
    if (usuario?.rol === "profesor") {
      const profesor = await planificacionesSemestresRepository.findProfesorByUsuarioId(usuario.id);
      if (!profesor) throw new ForbiddenError("No existe un perfil de profesor asociado");
      if (consulta?.profesorId && consulta.profesorId !== profesor.id) throw new ForbiddenError("Solo puede consultar su propia disponibilidad");
      if (consulta?.planificacionSemestreId) await planificacionesSemestresService.getById(consulta.planificacionSemestreId, alcance, usuario);
      filtro = { ...consulta, profesorId: profesor.id };
      const planificaciones = await planificacionesSemestresService.getAll(undefined, alcance, usuario);
      const permitidas = new Set(planificaciones.map(fila => fila.id));
      return (await disponibilidadRepository.findAll(filtro, alcance)).filter(fila => permitidas.has(fila.planificacionSemestreId));
    }
    if (consulta?.planificacionSemestreId) await planificacionesSemestresService.getById(consulta.planificacionSemestreId, alcance, usuario);
    return disponibilidadRepository.findAll(filtro, alcance);
  },
  async getById(id: number, alcance?: AlcanceCarrera, usuario?: UsuarioPlanificacion) {
    const registro = await disponibilidadRepository.findById(id);
    if (!registro) throw new NotFoundError(`Registro de disponibilidad con ID ${id} no encontrado`);
    await exigirProfesorPropio(registro.profesorId, usuario);
    await planificacionesSemestresService.getById(registro.planificacionSemestreId, alcance, usuario);
    return registro;
  },
  async createSingle(datos: CreateDisponibilidadDTO, alcance?: AlcanceCarrera, usuario?: UsuarioPlanificacion) {
    exigirEnAlcance(alcance?.profesoresIds, datos.profesorId);
    await exigirProfesorPropio(datos.profesorId, usuario);
    await exigirEditable(datos.planificacionSemestreId, alcance, usuario);
    if (!await disponibilidadRepository.checkProfesorExists(datos.profesorId)) throw new BadRequestError("El profesor no existe");
    if (!await disponibilidadRepository.checkBloqueExists(datos.bloqueId)) throw new BadRequestError("El bloque horario no existe");
    if (await disponibilidadRepository.findSpecific(datos.profesorId, datos.planificacionSemestreId, datos.bloqueId)) throw new ConflictError("El profesor ya tiene disponibilidad en ese bloque y planificación");
    const creada = await disponibilidadRepository.create(datos);
    return this.getById(creada.id, alcance, usuario);
  },
  async syncGrid(datos: SyncDisponibilidadDTO, alcance?: AlcanceCarrera, usuario?: UsuarioPlanificacion) {
    exigirEnAlcance(alcance?.profesoresIds, datos.profesorId);
    await exigirProfesorPropio(datos.profesorId, usuario);
    await exigirEditable(datos.planificacionSemestreId, alcance, usuario);
    if (!await disponibilidadRepository.checkProfesorExists(datos.profesorId)) throw new BadRequestError("El profesor no existe");
    const bloquesIds = [...new Set(datos.bloquesIds)];
    const existentes = await disponibilidadRepository.findExistingBloquesIds(bloquesIds);
    if (bloquesIds.some(id => !existentes.includes(id))) throw new BadRequestError("Hay bloques horarios inexistentes");
    return disponibilidadRepository.syncDisponibilidad(datos.profesorId, datos.planificacionSemestreId, bloquesIds);
  },
  async deleteSingle(id: number, alcance?: AlcanceCarrera, usuario?: UsuarioPlanificacion) {
    const registro = await this.getById(id, alcance, usuario);
    exigirEnAlcance(alcance?.profesoresIds, registro.profesorId);
    await exigirEditable(registro.planificacionSemestreId, alcance, usuario);
    await disponibilidadRepository.delete(id);
  },
  async clearGrid(profesorId: number, planificacionSemestreId: number, alcance?: AlcanceCarrera, usuario?: UsuarioPlanificacion) {
    exigirEnAlcance(alcance?.profesoresIds, profesorId);
    await exigirProfesorPropio(profesorId, usuario);
    await exigirEditable(planificacionSemestreId, alcance, usuario);
    if (!await disponibilidadRepository.checkProfesorExists(profesorId)) throw new BadRequestError("El profesor no existe");
    return disponibilidadRepository.deleteByProfesorAndPlanificacion(profesorId, planificacionSemestreId);
  },
};
