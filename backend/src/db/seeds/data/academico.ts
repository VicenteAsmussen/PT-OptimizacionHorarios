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

export const datosSemestres = [
  { codigo: "2026-1", anio: 2026, actual: true },
  { codigo: "2026-2", anio: 2026, actual: false },
];
