import { ForbiddenError } from "./errors.js";

export interface AlcanceCarrera {
  carreraId: number;
  asignaturasCodigos: string[];
  departamentosIds: number[];
  profesoresIds: number[];
  ofertasIds: number[];
}

// El alcance se construye exclusivamente desde la identidad autenticada, nunca desde el DTO.
export async function resolverAlcanceCarrera(usuario?: { id: number; rol: string }): Promise<AlcanceCarrera | undefined> {
  if (!usuario) throw new ForbiddenError("Se requiere un usuario autenticado");
  if (usuario.rol !== "secretaria") return undefined;
  const { carrerasRepository } = await import("../repositories/carreras.repository.js");
  const alcance = await carrerasRepository.findAlcanceByUsuarioId(usuario.id);
  if (!alcance) throw new ForbiddenError("El usuario no tiene una carrera de secretaria asociada");
  return alcance;
}

export function exigirEnAlcance<T>(permitidos: T[] | undefined, valor: T) {
  if (permitidos && !permitidos.includes(valor)) {
    throw new ForbiddenError("El recurso no pertenece al alcance de la carrera");
  }
}
