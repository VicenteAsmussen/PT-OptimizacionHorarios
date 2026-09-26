import { ofertasRepository } from "../repositories/ofertas.repository.js";
import {
  type CreateOfertaDTO,
  type UpdateOfertaDTO,
  type OfertaQueryDTO,
} from "../validations/ofertas.validation.js";
import { NotFoundError, ConflictError, BadRequestError } from "../utils/errors.js";

export const ofertasService = {
  async getAllOfertas(filter?: OfertaQueryDTO) {
    return await ofertasRepository.findAll(filter);
  },

  async getOfertaById(id: number) {
    const oferta = await ofertasRepository.findById(id);
    if (!oferta) {
      throw new NotFoundError(`Oferta de asignatura con ID ${id} no encontrada`);
    }
    return oferta;
  },

  async createOferta(dto: CreateOfertaDTO) {
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

  async updateOferta(id: number, dto: UpdateOfertaDTO) {
    const existing = await this.getOfertaById(id);

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

  async deleteOferta(id: number) {
    await this.getOfertaById(id);
    await ofertasRepository.delete(id);
  },
};
