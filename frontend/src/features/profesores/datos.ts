import type { CarreraProfesor, DepartamentoProfesor, FiltrosProfesores, Profesor } from "./types";

// Expresa el tipo contractual docente sin ocultar valores no reconocidos.
export function etiquetaTipoProfesor(tipo: string): string {
  if (tipo === "planta") return "Planta";
  if (tipo === "part time") return "Part time";
  return `Tipo no reconocido (${tipo})`;
}

// Limita el departamento a los datos necesarios para la gestión docente.
export function seleccionarDepartamento(departamento: DepartamentoProfesor): DepartamentoProfesor {
  return { id: departamento.id, nombre: departamento.nombre };
}

// Conserva las relaciones de carrera necesarias para derivar el alcance docente.
export function seleccionarCarrera(carrera: CarreraProfesor): CarreraProfesor {
  return {
    id: carrera.id,
    nombre: carrera.nombre,
    carreraDepartamentos: carrera.carreraDepartamentos.map((relacion) => ({
      departamentoId: relacion.departamentoId, esGestionado: relacion.esGestionado,
    })),
  };
}

// No copiar toda la respuesta, el servidor incluye el usuario completo y sus relaciones.
// Proyecta la ficha docente sin arrastrar campos adicionales de la respuesta.
export function seleccionarProfesor(profesor: Profesor): Profesor {
  return {
    id: profesor.id,
    ...(typeof profesor.tieneDependenciasAcademicas === "boolean"
      ? { tieneDependenciasAcademicas: profesor.tieneDependenciasAcademicas } : {}),
    rut: profesor.rut,
    nombre: profesor.nombre,
    departamentoId: profesor.departamentoId,
    tipo: profesor.tipo,
    usuarioId: profesor.usuarioId,
    departamento: seleccionarDepartamento(profesor.departamento),
    usuario: profesor.usuario ? {
      id: profesor.usuario.id,
      nombre: profesor.usuario.nombre,
      correo: profesor.usuario.correo,
      rol: profesor.usuario.rol,
    } : null,
  };
}

// Acota la consulta docente por identidad, departamento, contrato y acceso.
export function filtrarProfesores(
  profesores: readonly Profesor[], filtros: FiltrosProfesores = {},
): Profesor[] {
  const busqueda = filtros.busqueda?.trim().toLocaleLowerCase("es") ?? "";
  // La búsqueda parcial no valida el dígito verificador, solo retira separadores de una entrada RUT segura.
  const rutBuscado = /^[\dKk.-]+$/.test(busqueda) ? busqueda.replace(/[.-]/g, "").toUpperCase() : "";
  const buscarRut = rutBuscado.length > 0 && /^\d*K?$/.test(rutBuscado);
  return profesores.filter((profesor) =>
    (profesor.nombre.toLocaleLowerCase("es").includes(busqueda)
      || (buscarRut && typeof profesor.rut === "string"
        && profesor.rut.replace(/[.-]/g, "").toUpperCase().includes(rutBuscado)))
    && (filtros.departamentoId === undefined || profesor.departamentoId === filtros.departamentoId)
    && (filtros.tipo === undefined || profesor.tipo === filtros.tipo)
    && (filtros.acceso === undefined
      || (profesor.usuarioId !== null) === (filtros.acceso === "con acceso")))
    .sort((primero, segundo) => primero.nombre.localeCompare(segundo.nombre, "es", { sensitivity: "base" }));
}
