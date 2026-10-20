import type { AlcanceCarrera } from "../utils/alcance-carrera.js";
import { ofertasRepository } from "../repositories/ofertas.repository.js";
import { planificacionesSemestresService } from "./planificaciones-semestres.service.js";
import type { CreateOfertaDTO, UpdateOfertaDTO, OfertaQueryDTO } from "../validations/ofertas.validation.js";
import { NotFoundError, ConflictError, BadRequestError } from "../utils/errors.js";

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
    // La selección de profesores sigue siendo global, independiente de su departamento.
    if (!await ofertasRepository.checkProfesorExists(datos.profesorId)) throw new BadRequestError(`El profesor con ID ${datos.profesorId} no existe`);
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
    if (datos.profesorId && !await ofertasRepository.checkProfesorExists(datos.profesorId)) throw new BadRequestError(`El profesor con ID ${datos.profesorId} no existe`);
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
