import type { AlcanceProfesores, CarreraProfesor } from "./types";

type ProfesorEnAlcance = { departamentoId: number; tipo: string };

export function puedeGestionarProfesores(rol?: string): boolean {
  return rol === "admin" || rol === "secretaria";
}

// Usar exclusivamente GET /carreras de la sesión actual, no las relaciones de
// GET /departamentos: estas últimas pueden incluir carreras de otras secretarias.
export function derivarAlcanceProfesores(carreras: readonly CarreraProfesor[]): AlcanceProfesores {
  const relaciones = carreras.flatMap((carrera) => carrera.carreraDepartamentos);
  return {
    departamentosIds: [...new Set(relaciones.map((relacion) => relacion.departamentoId))],
    departamentosGestionadosIds: [...new Set(relaciones
      .filter((relacion) => relacion.esGestionado)
      .map((relacion) => relacion.departamentoId))],
  };
}

// Aplica a crear, editar y eliminar datos. Al editar, comprobar también el
// destino con este helper. El backend decide el bloqueo por horarios al borrar.
export function puedeAdministrarProfesor(
  rol: string | undefined, profesor: ProfesorEnAlcance, alcance?: AlcanceProfesores,
): boolean {
  return rol === "admin" || (rol === "secretaria" && profesor.tipo === "part time"
    && alcance?.departamentosIds.includes(profesor.departamentoId) === true);
}

// Aplica tanto al acceso opcional al crear como a POST/PUT/DELETE :id/usuario.
export function puedeAdministrarAcceso(
  rol: string | undefined, profesor: ProfesorEnAlcance, alcance?: AlcanceProfesores,
): boolean {
  return rol === "admin" || (rol === "secretaria" && profesor.tipo === "part time"
    && alcance?.departamentosGestionadosIds.includes(profesor.departamentoId) === true);
}
