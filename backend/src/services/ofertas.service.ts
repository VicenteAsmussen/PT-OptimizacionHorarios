import { exigirEnAlcance, type AlcanceCarrera } from "../utils/alcance-carrera.js";
import { ofertasRepository } from "../repositories/ofertas.repository.js";
import {
  type CreateOfertaDTO,
  type UpdateOfertaDTO,
  type OfertaQueryDTO,
} from "../validations/ofertas.validation.js";
import { NotFoundError, ConflictError, BadRequestError } from "../utils/errors.js";

export const ofertasService = {
  async getAllOfertas(filter?: OfertaQueryDTO, alcance?: AlcanceCarrera) {
    return await ofertasRepository.findAll(filter, alcance);
  },

  async getOfertaById(id: number, alcance?: AlcanceCarrera) {
    const oferta = await ofertasRepository.findById(id);
    if (!oferta || (alcance && !alcance.asignaturasCodigos.includes(oferta.asignaturaCodigo))) {
      throw new NotFoundError(`Oferta de asignatura con ID ${id} no encontrada`);
    }
    return oferta;
  },

  async createOferta(dto: CreateOfertaDTO, alcance?: AlcanceCarrera) {
    exigirEnAlcance(alcance?.asignaturasCodigos, dto.asignaturaCodigo);
    exigirEnAlcance(alcance?.profesoresIds, dto.profesorId);
    const asigExists = await ofertasRepository.checkAsignaturaExists(dto.asignaturaCodigo);
    if (!asigExists) {
      throw new BadRequestError(`La asignatura con código '${dto.asignaturaCodigo}' no existe`);
    }

    const profExists = await ofertasRepository.checkProfesorExists(dto.profesorId);
    if (!profExists) {
      throw new BadRequestError(`El profesor con ID ${dto.profesorId} no existe`);
    }

    const semExists = await ofertasRepository.checkSemestreExists(dto.semestreId);
    if (!semExists) {
      throw new BadRequestError(`El semestre con ID ${dto.semestreId} no existe`);
    }

    const seccion = dto.seccion ?? 1;
    const existingConflict = await ofertasRepository.findByUniqueConstraint(
      dto.asignaturaCodigo,
      dto.semestreId,
      seccion
    );

    if (existingConflict) {
      throw new ConflictError(
        `Ya existe una oferta para la asignatura '${dto.asignaturaCodigo}' sección ${seccion} en el semestre con ID ${dto.semestreId}`
      );
    }

    const created = await ofertasRepository.create(dto);
    return await this.getOfertaById(created.id);
  },

  async updateOferta(id: number, dto: UpdateOfertaDTO, alcance?: AlcanceCarrera) {
    const existing = await this.getOfertaById(id, alcance);
    exigirEnAlcance(alcance?.asignaturasCodigos, dto.asignaturaCodigo ?? existing.asignaturaCodigo);
    exigirEnAlcance(alcance?.profesoresIds, dto.profesorId ?? existing.profesorId);

    if (dto.asignaturaCodigo) {
      const asigExists = await ofertasRepository.checkAsignaturaExists(dto.asignaturaCodigo);
      if (!asigExists) {
        throw new BadRequestError(`La asignatura con código '${dto.asignaturaCodigo}' no existe`);
      }
    }

    if (dto.profesorId) {
      const profExists = await ofertasRepository.checkProfesorExists(dto.profesorId);
      if (!profExists) {
        throw new BadRequestError(`El profesor con ID ${dto.profesorId} no existe`);
      }
    }

    if (dto.semestreId) {
      const semExists = await ofertasRepository.checkSemestreExists(dto.semestreId);
      if (!semExists) {
        throw new BadRequestError(`El semestre con ID ${dto.semestreId} no existe`);
      }
    }

    const targetCodigo = dto.asignaturaCodigo ?? existing.asignaturaCodigo;
    const targetSemestre = dto.semestreId ?? existing.semestreId;
    const targetSeccion = dto.seccion ?? existing.seccion;

    if (
      targetCodigo !== existing.asignaturaCodigo ||
      targetSemestre !== existing.semestreId ||
      targetSeccion !== existing.seccion
    ) {
      const conflict = await ofertasRepository.findByUniqueConstraint(
        targetCodigo,
        targetSemestre,
        targetSeccion
      );

      if (conflict && conflict.id !== id) {
        throw new ConflictError(
          `Ya existe una oferta para la asignatura '${targetCodigo}' sección ${targetSeccion} en el semestre con ID ${targetSemestre}`
        );
      }
    }

    await ofertasRepository.update(id, dto);
    return await this.getOfertaById(id);
  },

  async deleteOferta(id: number, alcance?: AlcanceCarrera) {
    await this.getOfertaById(id, alcance);
    await ofertasRepository.delete(id);
  },
};
