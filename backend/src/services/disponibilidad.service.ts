import { disponibilidadRepository } from "../repositories/disponibilidad.repository.js";
import {
  type CreateDisponibilidadDTO,
  type SyncDisponibilidadDTO,
  type DisponibilidadQueryDTO,
} from "../validations/disponibilidad.validation.js";
import { NotFoundError, ConflictError, BadRequestError, ForbiddenError } from "../utils/errors.js";

export const disponibilidadService = {
  async getDisponibilidad(query?: DisponibilidadQueryDTO) {
    return await disponibilidadRepository.findAll(query);
  },

  async getById(id: number) {
    const record = await disponibilidadRepository.findById(id);
    if (!record) {
      throw new NotFoundError(`Registro de disponibilidad con ID ${id} no encontrado`);
    }
    return record;
  },

  async createSingle(dto: CreateDisponibilidadDTO) {
    const profExists = await disponibilidadRepository.checkProfesorExists(dto.profesorId);
    if (!profExists) {
      throw new BadRequestError(`El profesor con ID ${dto.profesorId} no existe`);
    }

    const semExists = await disponibilidadRepository.checkSemestreExists(dto.semestreId);
    if (!semExists) {
      throw new BadRequestError(`El semestre con ID ${dto.semestreId} no existe`);
    }

    const horariosExist = await disponibilidadRepository.checkHorariosExistForSemestre(dto.semestreId);
    if (horariosExist) {
      throw new ForbiddenError(
        "No es posible registrar disponibilidad: ya existe una propuesta de horarios generada para este semestre."
      );
    }

    const bloqueExists = await disponibilidadRepository.checkBloqueExists(dto.bloqueId);
    if (!bloqueExists) {
      throw new BadRequestError(`El bloque horario con ID ${dto.bloqueId} no existe`);
    }

    const existing = await disponibilidadRepository.findSpecific(
      dto.profesorId,
      dto.semestreId,
      dto.bloqueId
    );
    if (existing) {
      throw new ConflictError("El profesor ya tiene registrada disponibilidad para ese bloque y semestre");
    }

    const created = await disponibilidadRepository.create(dto);
    return await this.getById(created.id);
  },

  async syncGrid(dto: SyncDisponibilidadDTO) {
    const profExists = await disponibilidadRepository.checkProfesorExists(dto.profesorId);
    if (!profExists) {
      throw new BadRequestError(`El profesor con ID ${dto.profesorId} no existe`);
    }

    const semExists = await disponibilidadRepository.checkSemestreExists(dto.semestreId);
    if (!semExists) {
      throw new BadRequestError(`El semestre con ID ${dto.semestreId} no existe`);
    }

    const horariosExist = await disponibilidadRepository.checkHorariosExistForSemestre(dto.semestreId);
    if (horariosExist) {
      throw new ForbiddenError(
        "No es posible modificar la disponibilidad: ya existe una propuesta de horarios generada para este semestre."
      );
    }

    const uniqueBloquesIds = Array.from(new Set(dto.bloquesIds));

    if (uniqueBloquesIds.length > 0) {
      const existingBloques = await disponibilidadRepository.findExistingBloquesIds(uniqueBloquesIds);
      const missing = uniqueBloquesIds.filter((id) => !existingBloques.includes(id));
      if (missing.length > 0) {
        throw new BadRequestError(`Los siguientes bloques horarios no existen: [${missing.join(", ")}]`);
      }
    }

    return await disponibilidadRepository.syncDisponibilidad(
      dto.profesorId,
      dto.semestreId,
      uniqueBloquesIds
    );
  },

  async deleteSingle(id: number) {
    const record = await this.getById(id);
    const horariosExist = await disponibilidadRepository.checkHorariosExistForSemestre(record.semestreId);
    if (horariosExist) {
      throw new ForbiddenError(
        "No es posible eliminar la disponibilidad: ya existe una propuesta de horarios generada para este semestre."
      );
    }
    await disponibilidadRepository.delete(id);
  },

  async clearGrid(profesorId: number, semestreId: number) {
    const profExists = await disponibilidadRepository.checkProfesorExists(profesorId);
    if (!profExists) {
      throw new BadRequestError(`El profesor con ID ${profesorId} no existe`);
    }

    const semExists = await disponibilidadRepository.checkSemestreExists(semestreId);
    if (!semExists) {
      throw new BadRequestError(`El semestre con ID ${semestreId} no existe`);
    }

    const horariosExist = await disponibilidadRepository.checkHorariosExistForSemestre(semestreId);
    if (horariosExist) {
      throw new ForbiddenError(
        "No es posible limpiar la disponibilidad: ya existe una propuesta de horarios generada para este semestre."
      );
    }

    return await disponibilidadRepository.deleteByProfesorAndSemestre(profesorId, semestreId);
  },
};
