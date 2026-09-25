import { asignaturasRepository } from "../repositories/asignaturas.repository.js";
import {
  type CreateAsignaturaDTO,
  type UpdateAsignaturaDTO,
} from "../validations/asignaturas.validation.js";
import {
  NotFoundError,
  ConflictError,
  BadRequestError,
} from "../utils/errors.js";

export const asignaturasService = {
  async getAllAsignaturas() {
    return await asignaturasRepository.findAll();
  },

  async getAsignaturaByCodigo(codigo: string) {
    const asignatura = await asignaturasRepository.findByCodigo(codigo);
    if (!asignatura) {
      throw new NotFoundError(`Asignatura con código '${codigo}' no encontrada`);
    }
    return asignatura;
  },

  async createAsignatura(dto: CreateAsignaturaDTO) {
    const existing = await asignaturasRepository.findByCodigo(dto.codigo);
    if (existing) {
      throw new ConflictError(
        `Ya existe una asignatura con el código '${dto.codigo}'`
      );
    }

    if (dto.tiposHora && dto.tiposHora.length > 0) {
      const ids = dto.tiposHora.map((t) => t.tipoHoraId);
      const uniqueIds = new Set(ids);
      if (uniqueIds.size !== ids.length) {
        throw new BadRequestError("No se pueden duplicar tipos de hora en una misma asignatura");
      }

      const existingIds = await asignaturasRepository.findExistingTiposHoraIds(ids);
      const missingIds = ids.filter((id) => !existingIds.includes(id));
      if (missingIds.length > 0) {
        throw new BadRequestError(
          `Los siguientes tipos de hora no existen: [${missingIds.join(", ")}]`
        );
      }
    }

    if (dto.carrerasIds && dto.carrerasIds.length > 0) {
      const ids = dto.carrerasIds;
      const uniqueIds = new Set(ids);
      if (uniqueIds.size !== ids.length) {
        throw new BadRequestError("No se pueden duplicar carreras en una misma asignatura");
      }

      const existingIds = await asignaturasRepository.findExistingCarrerasIds(ids);
      const missingIds = ids.filter((id) => !existingIds.includes(id));
      if (missingIds.length > 0) {
        throw new BadRequestError(
          `Las siguientes carreras no existen: [${missingIds.join(", ")}]`
        );
      }
    }

    await asignaturasRepository.create(
      {
        codigo: dto.codigo,
        nombre: dto.nombre,
        semestreMalla: dto.semestreMalla,
        esCritica: dto.esCritica,
      },
      dto.tiposHora,
      dto.carrerasIds
    );

    return await this.getAsignaturaByCodigo(dto.codigo);
  },

  async updateAsignatura(codigo: string, dto: UpdateAsignaturaDTO) {
    await this.getAsignaturaByCodigo(codigo);

    if (dto.tiposHora && dto.tiposHora.length > 0) {
      const ids = dto.tiposHora.map((t) => t.tipoHoraId);
      const uniqueIds = new Set(ids);
      if (uniqueIds.size !== ids.length) {
        throw new BadRequestError("No se pueden duplicar tipos de hora en una misma asignatura");
      }

      const existingIds = await asignaturasRepository.findExistingTiposHoraIds(ids);
      const missingIds = ids.filter((id) => !existingIds.includes(id));
      if (missingIds.length > 0) {
        throw new BadRequestError(
          `Los siguientes tipos de hora no existen: [${missingIds.join(", ")}]`
        );
      }
    }

    if (dto.carrerasIds && dto.carrerasIds.length > 0) {
      const ids = dto.carrerasIds;
      const uniqueIds = new Set(ids);
      if (uniqueIds.size !== ids.length) {
        throw new BadRequestError("No se pueden duplicar carreras en una misma asignatura");
      }

      const existingIds = await asignaturasRepository.findExistingCarrerasIds(ids);
      const missingIds = ids.filter((id) => !existingIds.includes(id));
      if (missingIds.length > 0) {
        throw new BadRequestError(
          `Las siguientes carreras no existen: [${missingIds.join(", ")}]`
        );
      }
    }

    const { tiposHora, carrerasIds, ...datosBase } = dto;

    await asignaturasRepository.update(codigo, datosBase, tiposHora, carrerasIds);

    return await this.getAsignaturaByCodigo(codigo);
  },

  async deleteAsignatura(codigo: string) {
    await this.getAsignaturaByCodigo(codigo);
    await asignaturasRepository.delete(codigo);
  },
};
