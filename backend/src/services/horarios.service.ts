import { horariosRepository } from "../repositories/horarios.repository.js";
import {
  type CreateHorarioDTO,
  type UpdateHorarioDTO,
  type HorarioQueryDTO,
} from "../validations/horarios.validation.js";
import { NotFoundError, ConflictError, BadRequestError } from "../utils/errors.js";

export const horariosService = {
  async getAllHorarios(filter?: HorarioQueryDTO) {
    return await horariosRepository.findAll(filter);
  },

  async getHorarioById(id: number) {
    const horario = await horariosRepository.findById(id);
    if (!horario) {
      throw new NotFoundError(`Horario con ID ${id} no encontrado`);
    }
    return horario;
  },

  async createHorario(dto: CreateHorarioDTO) {
    const oferta = await horariosRepository.findOfertaWithDetails(dto.ofertaId);
    if (!oferta) {
      throw new BadRequestError(`La oferta de asignatura con ID ${dto.ofertaId} no existe`);
    }

    const semestreId = dto.semestreId ?? oferta.semestreId;
    if (dto.semestreId && dto.semestreId !== oferta.semestreId) {
      throw new BadRequestError(
        `El semestre indicado (${dto.semestreId}) no coincide con el semestre de la oferta (${oferta.semestreId})`
      );
    }

    const semExists = await horariosRepository.checkSemestreExists(semestreId);
    if (!semExists) {
      throw new BadRequestError(`El semestre con ID ${semestreId} no existe`);
    }

    const salaExists = await horariosRepository.checkSalaExists(dto.salaId);
    if (!salaExists) {
      throw new BadRequestError(`La sala con ID ${dto.salaId} no existe`);
    }

    const bloqueExists = await horariosRepository.checkBloqueExists(dto.bloqueId);
    if (!bloqueExists) {
      throw new BadRequestError(`El bloque horario con ID ${dto.bloqueId} no existe`);
    }

    const thExists = await horariosRepository.checkTipoHoraExists(dto.tipoHoraId);
    if (!thExists) {
      throw new BadRequestError(`El tipo de hora con ID ${dto.tipoHoraId} no existe`);
    }

    // Hard Constraint 1: Choque de sala en el mismo bloque y semestre
    const salaConflict = await horariosRepository.findBySalaBloqueSemestre(
      dto.salaId,
      dto.bloqueId,
      semestreId
    );
    if (salaConflict) {
      throw new ConflictError(
        `Conflicto de horario: La sala ya se encuentra ocupada en este bloque para el semestre indicado`
      );
    }

    // Hard Constraint 2: Choque de la misma oferta en el mismo bloque
    const ofertaConflict = await horariosRepository.findByOfertaBloque(
      dto.ofertaId,
      dto.bloqueId
    );
    if (ofertaConflict) {
      throw new ConflictError(
        `Conflicto de horario: Esta sección de asignatura ya tiene una clase asignada en el bloque indicado`
      );
    }

    // Hard Constraint 3: Choque de profesor en el mismo bloque y semestre
    const profConflict = await horariosRepository.findByProfesorBloqueSemestre(
      oferta.profesorId,
      dto.bloqueId,
      semestreId
    );
    if (profConflict) {
      throw new ConflictError(
        `Conflicto de horario: El docente '${oferta.profesor.nombre}' ya tiene otra clase asignada en este bloque horario`
      );
    }

    const created = await horariosRepository.create({
      ...dto,
      semestreId,
    });

    return await this.getHorarioById(created.id);
  },

  async updateHorario(id: number, dto: UpdateHorarioDTO) {
    const existing = await this.getHorarioById(id);

    const targetOfertaId = dto.ofertaId ?? existing.ofertaId;
    const targetSalaId = dto.salaId ?? existing.salaId;
    const targetBloqueId = dto.bloqueId ?? existing.bloqueId;
    const targetTipoHoraId = dto.tipoHoraId ?? existing.tipoHoraId;
    const targetSemestreId = dto.semestreId ?? existing.semestreId;

    const oferta = await horariosRepository.findOfertaWithDetails(targetOfertaId);
    if (!oferta) {
      throw new BadRequestError(`La oferta de asignatura con ID ${targetOfertaId} no existe`);
    }

    if (targetSemestreId !== oferta.semestreId) {
      throw new BadRequestError(
        `El semestre indicado (${targetSemestreId}) no coincide con el semestre de la oferta (${oferta.semestreId})`
      );
    }

    if (dto.salaId) {
      const salaExists = await horariosRepository.checkSalaExists(dto.salaId);
      if (!salaExists) {
        throw new BadRequestError(`La sala con ID ${dto.salaId} no existe`);
      }
    }

    if (dto.bloqueId) {
      const bloqueExists = await horariosRepository.checkBloqueExists(dto.bloqueId);
      if (!bloqueExists) {
        throw new BadRequestError(`El bloque horario con ID ${dto.bloqueId} no existe`);
      }
    }

    if (dto.tipoHoraId) {
      const thExists = await horariosRepository.checkTipoHoraExists(dto.tipoHoraId);
      if (!thExists) {
        throw new BadRequestError(`El tipo de hora con ID ${dto.tipoHoraId} no existe`);
      }
    }

    if (dto.semestreId) {
      const semExists = await horariosRepository.checkSemestreExists(dto.semestreId);
      if (!semExists) {
        throw new BadRequestError(`El semestre con ID ${dto.semestreId} no existe`);
      }
    }

    // Validar Choque de Sala
    const salaConflict = await horariosRepository.findBySalaBloqueSemestre(
      targetSalaId,
      targetBloqueId,
      targetSemestreId
    );
    if (salaConflict && salaConflict.id !== id) {
      throw new ConflictError(
        `Conflicto de horario: La sala ya se encuentra ocupada en este bloque para el semestre indicado`
      );
    }

    // Validar Choque de Oferta
    const ofertaConflict = await horariosRepository.findByOfertaBloque(
      targetOfertaId,
      targetBloqueId
    );
    if (ofertaConflict && ofertaConflict.id !== id) {
      throw new ConflictError(
        `Conflicto de horario: Esta sección de asignatura ya tiene una clase asignada en el bloque indicado`
      );
    }

    // Validar Choque de Profesor
    const profConflict = await horariosRepository.findByProfesorBloqueSemestre(
      oferta.profesorId,
      targetBloqueId,
      targetSemestreId
    );
    if (profConflict && profConflict.id !== id) {
      throw new ConflictError(
        `Conflicto de horario: El docente '${oferta.profesor.nombre}' ya tiene otra clase asignada en este bloque horario`
      );
    }

    await horariosRepository.update(id, {
      ...dto,
      semestreId: targetSemestreId,
    });

    return await this.getHorarioById(id);
  },

  async deleteHorario(id: number) {
    await this.getHorarioById(id);
    await horariosRepository.delete(id);
  },

  async deleteHorariosByOferta(ofertaId: number) {
    const oferta = await horariosRepository.findOfertaWithDetails(ofertaId);
    if (!oferta) {
      throw new NotFoundError(`Oferta de asignatura con ID ${ofertaId} no encontrada`);
    }
    return await horariosRepository.deleteByOferta(ofertaId);
  },
};
