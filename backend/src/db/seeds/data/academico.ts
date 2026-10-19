export const datosTiposHora = [
  { tipo: "Teórica" },
  { tipo: "Práctica" },
  { tipo: "Laboratorio" },
];

export const datosDepartamentos = [
  { nombre: "Sistemas de Información" },
  { nombre: "Economía y Finanzas" },
  { nombre: "Administración y Auditoría" },
];

export const datosCarreras = [
  { nombre: "Ingeniería Civil en Informática" },
  { nombre: "Ingeniería de Ejecución en Computación e Informática" },
];

// La relación indica prestación de servicios; esGestionado añade gestión operativa.
export const departamentosGestionados = new Set([
  "Sistemas de Información",
  "Economía y Finanzas",
  "Administración y Auditoría",
]);

// Asignaciones docentes explícitas, independientes de carrera y profesor.
export const datosAsignaturas = [
  { codigo: "INF100", nombre: "Programación", semestreMalla: 1, departamento: "Sistemas de Información", carreras: ["Ingeniería Civil en Informática", "Ingeniería de Ejecución en Computación e Informática"] },
  { codigo: "ECO100", nombre: "Economía", semestreMalla: 3, departamento: "Economía y Finanzas", carreras: ["Ingeniería Civil en Informática"] },
  { codigo: "ADM100", nombre: "Administración", semestreMalla: 3, departamento: "Administración y Auditoría", carreras: ["Ingeniería Civil en Informática"] },
];

export const datosSemestres = [
  { codigo: "2026-1", actual: false },
  { codigo: "2026-2", actual: true },
];
