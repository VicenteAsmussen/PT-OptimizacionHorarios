import { carrerasRepository } from "../repositories/carreras.repository.js";
import { type CreateCarreraDTO, type UpdateCarreraDTO } from "../validations/carreras.validation.js";
import { NotFoundError, ConflictError, BadRequestError } from "../utils/errors.js";

function validarIdsUnicos(ids: number[], mensaje: string) {
  if (new Set(ids).size !== ids.length) {
    throw new BadRequestError(mensaje);
  }
}

async function validarDepartamentosExistentes(ids: number[]) {
  const idsUnicos = [...new Set(ids)];
  const existingIds = await carrerasRepository.findExistingDepartamentosIds(idsUnicos);
  const missingIds = idsUnicos.filter((id) => !existingIds.includes(id));
  if (missingIds.length > 0) {
    throw new BadRequestError(
      `Los siguientes departamentos no existen: [${missingIds.join(", ")}]`
    );
  }
}

function construirRelacionesDepartamento(departamentosIds: number[], departamentosGestionadosIds: number[]) {
  const gestionados = new Set(departamentosGestionadosIds);
  const noRelacionados = departamentosGestionadosIds.filter((id) => !departamentosIds.includes(id));
  if (noRelacionados.length > 0) {
    throw new BadRequestError(
      `Los departamentos gestionados deben estar asociados a la carrera: [${noRelacionados.join(", ")}]`
    );
  }
  return departamentosIds.map((departamentoId) => ({
    departamentoId,
    esGestionado: gestionados.has(departamentoId),
  }));
}

export const carrerasService = {
  async getAllCarreras() {
    return await carrerasRepository.findAll();
  },

  async getCarreraById(id: number) {
    const carrera = await carrerasRepository.findById(id);
    if (!carrera) {
      throw new NotFoundError(`Carrera con ID ${id} no encontrada`);
    }
    return carrera;
  },

  async createCarrera(dto: CreateCarreraDTO) {
    const existing = await carrerasRepository.findByNombre(dto.nombre);
    if (existing) {
      throw new ConflictError(`Ya existe una carrera con el nombre '${dto.nombre}'`);
    }

    validarIdsUnicos(dto.departamentosIds, "No se pueden duplicar departamentos en una misma carrera");
    validarIdsUnicos(dto.departamentosGestionadosIds, "No se pueden duplicar departamentos gestionados en una misma carrera");
    await validarDepartamentosExistentes([...dto.departamentosIds, ...dto.departamentosGestionadosIds]);
    const departamentos = construirRelacionesDepartamento(dto.departamentosIds, dto.departamentosGestionadosIds);

    const created = await carrerasRepository.create(
      { nombre: dto.nombre },
      departamentos
    );

    return await this.getCarreraById(created.id);
  },

  async updateCarrera(id: number, dto: UpdateCarreraDTO) {
    const carreraActual = await this.getCarreraById(id);

    if (dto.nombre) {
      const existing = await carrerasRepository.findByNombre(dto.nombre);
      if (existing && existing.id !== id) {
        throw new ConflictError(`Ya existe otra carrera con el nombre '${dto.nombre}'`);
      }
    }

    const debeActualizarDepartamentos = dto.departamentosIds !== undefined || dto.departamentosGestionadosIds !== undefined;
    let departamentos;
    if (debeActualizarDepartamentos) {
      const departamentosIds = dto.departamentosIds ?? carreraActual.carreraDepartamentos.map((relacion) => relacion.departamentoId);
      const departamentosGestionadosIds = dto.departamentosGestionadosIds ?? carreraActual.carreraDepartamentos
        .filter((relacion) => relacion.esGestionado && departamentosIds.includes(relacion.departamentoId))
        .map((relacion) => relacion.departamentoId);
      validarIdsUnicos(departamentosIds, "No se pueden duplicar departamentos en una misma carrera");
      validarIdsUnicos(departamentosGestionadosIds, "No se pueden duplicar departamentos gestionados en una misma carrera");
      await validarDepartamentosExistentes([...departamentosIds, ...departamentosGestionadosIds]);
      departamentos = construirRelacionesDepartamento(departamentosIds, departamentosGestionadosIds);
    }

    const { departamentosIds, departamentosGestionadosIds, ...datosBase } = dto;
    await carrerasRepository.update(id, datosBase, departamentos);

    return await this.getCarreraById(id);
  },

  async deleteCarrera(id: number) {
    await this.getCarreraById(id);
    await carrerasRepository.delete(id);
  },
};
