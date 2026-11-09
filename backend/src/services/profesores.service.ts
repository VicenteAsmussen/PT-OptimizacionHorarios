import { exigirEnAlcance, type AlcanceCarrera } from "../utils/alcance-carrera.js";
import { profesoresRepository } from "../repositories/profesores.repository.js";
import { usuariosRepository } from "../repositories/usuarios.repository.js";
import { type AccesoProfesorDTO, type CreateProfesorDTO, type UpdateAccesoProfesorDTO, type UpdateProfesorDTO } from "../validations/profesores.validation.js";
import { NotFoundError, ConflictError, BadRequestError, ForbiddenError } from "../utils/errors.js";
import { hashPassword } from "../utils/password.js";
import type { TokenPayload } from "../utils/jwt.js";
import { normalizarRut } from "../utils/rut.js";

function exigirRut(valor: unknown): string {
  const rut = normalizarRut(valor);
  if (rut === null) throw new BadRequestError("El RUT del profesor no es válido");
  return rut;
}

async function exigirRutDisponible(rut: string, id?: number) {
  const existente = await profesoresRepository.findByRut(rut);
  if (existente && existente.id !== id) {
    throw new ConflictError("Ya existe un profesor con ese RUT");
  }
}

// Drizzle puede envolver el error PostgreSQL en cause; no mapear otras restricciones.
async function conConflictoRut<T>(operacion: () => Promise<T>): Promise<T> {
  try {
    return await operacion();
  } catch (error) {
    let causa: unknown = error;
    const visitadas = new Set<unknown>();
    while (causa && typeof causa === "object" && !visitadas.has(causa)) {
      visitadas.add(causa);
      const detalle = causa as { code?: string; constraint_name?: string; constraint?: string; cause?: unknown };
      if (detalle.code === "23505" && (detalle.constraint_name ?? detalle.constraint) === "profesores_rut_unique") {
        throw new ConflictError("Ya existe un profesor con ese RUT");
      }
      causa = detalle.cause;
    }
    throw error;
  }
}

function esSecretaria(usuario?: Pick<TokenPayload, "rol">) {
  return usuario?.rol === "secretaria";
}

function exigirProfesorPartTimeGestionado(alcance: AlcanceCarrera | undefined, departamentoId: number, tipo: string) {
  if (tipo !== "part time") {
    throw new ForbiddenError("La secretaria solo puede gestionar acceso de profesores part time");
  }
  exigirEnAlcance(alcance?.departamentosGestionadosIds, departamentoId);
}

async function exigirCuentaProfesorGestionable(usuarioId: number | null) {
  if (!usuarioId) return;
  const cuenta = await usuariosRepository.findById(usuarioId);
  if (!cuenta || cuenta.rol !== "profesor") {
    throw new ForbiddenError("La secretaría no puede administrar cuentas privilegiadas desde profesores");
  }
}

export const profesoresService = {
  async getSeleccionProfesores() {
    return await profesoresRepository.findSeleccion();
  },

  async getAllProfesores(departamentoId?: number, alcance?: AlcanceCarrera) {
    if (departamentoId !== undefined) exigirEnAlcance(alcance?.departamentosIds, departamentoId);
    return await profesoresRepository.findAll(departamentoId, alcance);
  },

  async getProfesorById(id: number, alcance?: AlcanceCarrera) {
    const profesor = await profesoresRepository.findById(id, alcance);
    if (!profesor || (alcance && !alcance.departamentosIds.includes(profesor.departamentoId))) {
      throw new NotFoundError(`Profesor con ID ${id} no encontrado`);
    }
    return profesor;
  },

  async createProfesor(dto: CreateProfesorDTO, alcance?: AlcanceCarrera, usuario?: TokenPayload) {
    const { acceso, ...datosProfesor } = dto;
    exigirEnAlcance(alcance?.departamentosIds, datosProfesor.departamentoId);

    if (esSecretaria(usuario) && datosProfesor.tipo !== "part time") {
      throw new ForbiddenError("La secretaria solo puede crear profesores part time");
    }

    if (esSecretaria(usuario) && datosProfesor.usuarioId) {
      throw new ForbiddenError("La secretaría debe crear el acceso desde el profesor, no vincular cuentas existentes");
    }

    if ((acceso || datosProfesor.usuarioId) && esSecretaria(usuario)) {
      exigirProfesorPartTimeGestionado(alcance, datosProfesor.departamentoId, datosProfesor.tipo);
    }

    datosProfesor.rut = exigirRut(datosProfesor.rut);
    await exigirRutDisponible(datosProfesor.rut);

    const deptoExists = await profesoresRepository.checkDepartamentoExists(datosProfesor.departamentoId);
    if (!deptoExists) {
      throw new BadRequestError(`El departamento con ID ${datosProfesor.departamentoId} no existe`);
    }

    if (datosProfesor.usuarioId) {
      const userExists = await profesoresRepository.checkUsuarioExists(datosProfesor.usuarioId);
      if (!userExists) {
        throw new BadRequestError(`El usuario con ID ${datosProfesor.usuarioId} no existe`);
      }

      const existingLinked = await profesoresRepository.findByUsuarioId(datosProfesor.usuarioId);
      if (existingLinked) {
        throw new ConflictError(`El usuario con ID ${datosProfesor.usuarioId} ya está vinculado al profesor '${existingLinked.nombre}'`);
      }
    }

    if (acceso) {
      const existing = await usuariosRepository.findByCorreo(acceso.correo);
      if (existing) {
        throw new ConflictError(`Ya existe un usuario con el correo '${acceso.correo}'`);
      }
      const clave = await hashPassword(acceso.clave);
      const created = await conConflictoRut(() => profesoresRepository.createWithUsuario(datosProfesor, {
        nombre: datosProfesor.nombre,
        correo: acceso.correo,
        clave,
        rol: "profesor",
      }));
      return await this.getProfesorById(created.id, alcance);
    }

    const created = await conConflictoRut(() => profesoresRepository.create(datosProfesor));
    return await this.getProfesorById(created.id, alcance);
  },

  async updateProfesor(id: number, dto: UpdateProfesorDTO, alcance?: AlcanceCarrera, usuario?: TokenPayload) {
    const profesor = await this.getProfesorById(id, alcance);
    const departamentoDestino = dto.departamentoId ?? profesor.departamentoId;
    const tipoDestino = dto.tipo ?? profesor.tipo;
    exigirEnAlcance(alcance?.departamentosIds, departamentoDestino);

    if (esSecretaria(usuario)) {
      if (profesor.tipo !== "part time" || tipoDestino !== "part time") {
        throw new ForbiddenError("La secretaria no puede administrar profesores planta");
      }
      if (dto.usuarioId !== undefined && dto.usuarioId !== profesor.usuarioId) {
        throw new ForbiddenError("La secretaría no puede cambiar la cuenta vinculada del profesor");
      }
      if (profesor.usuarioId) {
        exigirProfesorPartTimeGestionado(alcance, profesor.departamentoId, profesor.tipo);
        exigirProfesorPartTimeGestionado(alcance, departamentoDestino, tipoDestino);
        await exigirCuentaProfesorGestionable(profesor.usuarioId);
      }
    }

    if (dto.rut !== undefined) {
      const rut = exigirRut(dto.rut);
      dto = { ...dto, rut };
      await exigirRutDisponible(rut, id);
    }

    if (dto.departamentoId) {
      const deptoExists = await profesoresRepository.checkDepartamentoExists(dto.departamentoId);
      if (!deptoExists) {
        throw new BadRequestError(`El departamento con ID ${dto.departamentoId} no existe`);
      }
    }

    if (dto.usuarioId) {
      if (esSecretaria(usuario)) {
        exigirProfesorPartTimeGestionado(alcance, departamentoDestino, tipoDestino);
      }
      const userExists = await profesoresRepository.checkUsuarioExists(dto.usuarioId);
      if (!userExists) {
        throw new BadRequestError(`El usuario con ID ${dto.usuarioId} no existe`);
      }

      const existingLinked = await profesoresRepository.findByUsuarioId(dto.usuarioId);
      if (existingLinked && existingLinked.id !== id) {
        throw new ConflictError(`El usuario con ID ${dto.usuarioId} ya está vinculado a otro profesor`);
      }
    }

    const cuentaId = dto.usuarioId ?? profesor.usuarioId;
    await conConflictoRut(() => esSecretaria(usuario) && cuentaId
      ? profesoresRepository.updateWithSyncedUsuarioName(id, dto, cuentaId, true)
      : profesoresRepository.updateWithSyncedUsuarioName(id, dto, cuentaId));
    return await this.getProfesorById(id, alcance);
  },

  async createUsuarioProfesor(id: number, dto: AccesoProfesorDTO, alcance?: AlcanceCarrera, usuario?: TokenPayload) {
    const profesor = await this.getProfesorById(id, alcance);
    if (profesor.usuarioId) {
      throw new ConflictError("El profesor ya tiene acceso al sistema");
    }
    if (esSecretaria(usuario)) {
      exigirProfesorPartTimeGestionado(alcance, profesor.departamentoId, profesor.tipo);
    }

    const existing = await usuariosRepository.findByCorreo(dto.correo);
    if (existing) {
      throw new ConflictError(`Ya existe un usuario con el correo '${dto.correo}'`);
    }

    await profesoresRepository.createUsuarioForProfesor(id, {
      nombre: profesor.nombre,
      correo: dto.correo,
      clave: await hashPassword(dto.clave),
      rol: "profesor",
    });
    return await this.getProfesorById(id, alcance);
  },

  async updateUsuarioProfesor(id: number, dto: UpdateAccesoProfesorDTO, alcance?: AlcanceCarrera, usuario?: TokenPayload) {
    const profesor = await this.getProfesorById(id, alcance);
    if (!profesor.usuarioId || !profesor.usuario) {
      throw new NotFoundError("El profesor no tiene acceso al sistema");
    }
    if (esSecretaria(usuario)) {
      exigirProfesorPartTimeGestionado(alcance, profesor.departamentoId, profesor.tipo);
      await exigirCuentaProfesorGestionable(profesor.usuarioId);
    }

    if (dto.correo) {
      const existing = await usuariosRepository.findByCorreo(dto.correo);
      if (existing && existing.id !== profesor.usuarioId) {
        throw new ConflictError(`Ya existe otro usuario con el correo '${dto.correo}'`);
      }
    }

    const datosCuenta = {
      nombre: profesor.nombre,
      correo: dto.correo,
      clave: dto.clave ? await hashPassword(dto.clave) : undefined,
    };
    if (esSecretaria(usuario)) await profesoresRepository.updateUsuarioForProfesor(profesor.usuarioId, datosCuenta, true);
    else await profesoresRepository.updateUsuarioForProfesor(profesor.usuarioId, datosCuenta);
    return await this.getProfesorById(id, alcance);
  },

  async deleteUsuarioProfesor(id: number, alcance?: AlcanceCarrera, usuario?: TokenPayload) {
    const profesor = await this.getProfesorById(id, alcance);
    if (!profesor.usuarioId) {
      throw new NotFoundError("El profesor no tiene acceso al sistema");
    }
    if (esSecretaria(usuario)) {
      exigirProfesorPartTimeGestionado(alcance, profesor.departamentoId, profesor.tipo);
      await exigirCuentaProfesorGestionable(profesor.usuarioId);
    }
    if (esSecretaria(usuario)) await profesoresRepository.deleteUsuarioForProfesor(id, profesor.usuarioId, true);
    else await profesoresRepository.deleteUsuarioForProfesor(id, profesor.usuarioId);
  },

  async deleteProfesor(id: number, alcance?: AlcanceCarrera, usuario?: TokenPayload) {
    const profesor = await this.getProfesorById(id, alcance);

    if (usuario?.rol === "admin") {
      await profesoresRepository.deleteSinDependencias(id, profesor.usuarioId);
      return;
    }

    if (esSecretaria(usuario) && profesor.tipo !== "part time") {
      throw new ForbiddenError("La secretaria solo puede eliminar profesores part time");
    }

    if (esSecretaria(usuario) && profesor.usuarioId) {
      exigirProfesorPartTimeGestionado(alcance, profesor.departamentoId, profesor.tipo);
      await exigirCuentaProfesorGestionable(profesor.usuarioId);
    }

    const tieneHorarios = await profesoresRepository.hasHorarios(id);
    if (tieneHorarios) {
      throw new ConflictError("No se puede eliminar el profesor porque participa en horarios registrados. Puedes quitar su acceso al sistema.");
    }

    if (esSecretaria(usuario) && profesor.usuarioId) await profesoresRepository.deleteWithDependencias(id, profesor.usuarioId, true);
    else await profesoresRepository.deleteWithDependencias(id, profesor.usuarioId);
  },
};
