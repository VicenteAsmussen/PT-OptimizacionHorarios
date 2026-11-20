import type { AlcanceProfesores, CarreraProfesor } from "./types";

type ProfesorEnAlcance = { departamentoId: number; tipo: string; tieneDependenciasAcademicas?: boolean };

// Habilita el catálogo docente para administración y secretaría.
export function puedeGestionarProfesores(rol?: string): boolean {
  return rol === "admin" || rol === "secretaria";
}

// Usar solo GET /carreras de la sesión actual, GET /departamentos puede incluir carreras de otras secretarías.
// Deriva los departamentos consultables y propios desde las carreras de la cuenta.
export function derivarAlcanceProfesores(carreras: readonly CarreraProfesor[]): AlcanceProfesores {
  const relaciones = carreras.flatMap((carrera) => carrera.carreraDepartamentos);
  return {
    departamentosIds: [...new Set(relaciones.map((relacion) => relacion.departamentoId))],
    departamentosGestionadosIds: [...new Set(relaciones
      .filter((relacion) => relacion.esGestionado)
      .map((relacion) => relacion.departamentoId))],
  };
}

// Aplica al crear y editar identidad, al editar también se debe comprobar el destino.
// Acota la gestión de identidad de secretaría a docentes de tipo "part time" de su alcance.
export function puedeAdministrarProfesor(
  rol: string | undefined, profesor: ProfesorEnAlcance, alcance?: AlcanceProfesores,
): boolean {
  return rol === "admin" || (rol === "secretaria" && profesor.tipo === "part time"
    && alcance?.departamentosIds.includes(profesor.departamentoId) === true);
}

// Aplica tanto al acceso opcional al crear como a POST/PUT/DELETE :id/usuario.
// Restringe los accesos de secretaría a docentes de tipo "part time" de departamentos propios.
export function puedeAdministrarAcceso(
  rol: string | undefined, profesor: ProfesorEnAlcance, alcance?: AlcanceProfesores,
): boolean {
  return rol === "admin" || (rol === "secretaria" && profesor.tipo === "part time"
    && alcance?.departamentosGestionadosIds.includes(profesor.departamentoId) === true);
}

// Filtra la eliminación docente considerando permisos y dependencias del administrador.
export function puedeEliminarProfesor(
  rol: string | undefined, profesor: ProfesorEnAlcance, alcance?: AlcanceProfesores,
): boolean {
  return puedeAdministrarProfesor(rol, profesor, alcance)
    && !(rol === "admin" && profesor.tieneDependenciasAcademicas === true);
}
