import type { AlcanceCarrera } from "../utils/alcance-carrera.js";
import { ofertasRepository } from "../repositories/ofertas.repository.js";
import { planificacionesSemestresService } from "./planificaciones-semestres.service.js";
import type { CreateOfertaDTO, UpdateOfertaDTO, OfertaQueryDTO } from "../validations/ofertas.validation.js";
import { NotFoundError, ConflictError, BadRequestError } from "../utils/errors.js";

async function validarAsignaciones(codigo: string, asignaciones: CreateOfertaDTO["asignaciones"]) {
  if (!asignaciones.length) return;
  const tipos = await ofertasRepository.findTiposAsignatura(codigo);
  if (new Set(asignaciones.map(a => a.tipoHoraId)).size !== asignaciones.length
    || asignaciones.some(a => !tipos.some(t => t.tipoHoraId === a.tipoHoraId))) {
    throw new BadRequestError("Las asignaciones deben tener tipos de hora únicos definidos para la asignatura");
  }
  for (const asignacion of asignaciones) {
    if (!await ofertasRepository.checkProfesorExists(asignacion.profesorId)) {
      throw new BadRequestError(`El profesor con ID ${asignacion.profesorId} no existe`);
    }
    if (!await ofertasRepository.checkProfesorDepartamento(asignacion.profesorId, codigo)) {
      throw new BadRequestError(`El profesor con ID ${asignacion.profesorId} no pertenece al departamento de la asignatura`);
    }
  }
}

export const ofertasService = {
  async getAllOfertas(filtro?: OfertaQueryDTO, alcance?: AlcanceCarrera) {
    if (filtro?.planificacionSemestreId) await planificacionesSemestresService.getById(filtro.planificacionSemestreId, alcance);
    return ofertasRepository.findAll(filtro, alcance);
  },
  async getOfertaById(id: number, alcance?: AlcanceCarrera) {
    const oferta = await ofertasRepository.findById(id);
    if (!oferta || (alcance && oferta.planificacionSemestre.carreraId !== alcance.carreraId)) throw new NotFoundError(`Oferta de asignatura con ID ${id} no encontrada`);
    return oferta;
  },
  async createOferta(datos: CreateOfertaDTO, alcance?: AlcanceCarrera) {
    await planificacionesSemestresService.exigirAsignatura(datos.planificacionSemestreId, datos.asignaturaCodigo, alcance);
    await validarAsignaciones(datos.asignaturaCodigo, datos.asignaciones ?? []);
    if (await ofertasRepository.findByUniqueConstraint(datos.asignaturaCodigo, datos.planificacionSemestreId, datos.seccion)) throw new ConflictError("Ya existe esta sección en la planificación");
    const creada = await ofertasRepository.create(datos);
    return this.getOfertaById(creada.id, alcance);
  },
  async updateOferta(id: number, datos: UpdateOfertaDTO, alcance?: AlcanceCarrera) {
    const existente = await this.getOfertaById(id, alcance);
    const codigo = datos.asignaturaCodigo ?? existente.asignaturaCodigo;
    const planificacionSemestreId = datos.planificacionSemestreId ?? existente.planificacionSemestreId;
    const seccion = datos.seccion ?? existente.seccion;
    await planificacionesSemestresService.exigirAsignatura(planificacionSemestreId, codigo, alcance);
    await validarAsignaciones(codigo, datos.asignaciones ?? existente.asignaciones);
    const conflicto = await ofertasRepository.findByUniqueConstraint(codigo, planificacionSemestreId, seccion);
    if (conflicto && conflicto.id !== id) throw new ConflictError("Ya existe esta sección en la planificación");
    if (planificacionSemestreId !== existente.planificacionSemestreId && existente.horarios.length) throw new ConflictError("No se puede trasladar una oferta con horarios asociados");
    await ofertasRepository.update(id, datos, existente.planificacionSemestreId);
    return this.getOfertaById(id, alcance);
  },
  async deleteOferta(id: number, alcance?: AlcanceCarrera) {
    const existente = await this.getOfertaById(id, alcance);
    await ofertasRepository.delete(id, existente.planificacionSemestreId);
  },
};
