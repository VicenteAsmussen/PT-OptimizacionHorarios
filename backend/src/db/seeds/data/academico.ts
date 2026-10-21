export const datosTiposHora = [
  { tipo: "Teórica" },
  { tipo: "Práctica" },
  { tipo: "Laboratorio" },
];

export const datosDepartamentos = [
  { nombre: "Departamento de Sistemas de Información" },
  { nombre: "Departamento de Administración y Auditoría" },
  { nombre: "Departamento de Economía y Finanzas" },
  { nombre: "Departamento de Matemática" },
  { nombre: "Departamento de Física" },
  { nombre: "Departamento de Química" },
  { nombre: "Departamento de Estadística" },
  { nombre: "Departamento de Estudios Generales" },
  { nombre: "Departamento de Ingeniería Industrial" },
];

export const datosCarreras = [
  { nombre: "Ingeniería Civil en Informática" },
  { nombre: "Ingeniería de Ejecución en Computación e Informática" },
];

// La relación indica prestación de servicios; esGestionado añade gestión operativa.
export const departamentosGestionados = new Set([
  "Departamento de Sistemas de Información",
  "Departamento de Administración y Auditoría",
  "Departamento de Economía y Finanzas",
]);

// OptimizacionHorarios_v3.xlsx: Asignaturas + Malla, A1–A19 except A3/A4/A13/A14.
// Hours are 40-minute academic blocks, ordered theoretical/practical/laboratory.
const carrera = "Ingeniería Civil en Informática";
export const datosAsignaturas = [
  { codigo: "220143", nombre: "Álgebra y Trigonometría", semestreMalla: 1, departamento: "Matemática", horas: [4, 4, 0] },
  { codigo: "620431", nombre: "Introducción a la Programación", semestreMalla: 1, departamento: "Sistemas de Información", horas: [5, 2, 2] },
  { codigo: "220144", nombre: "Cálculo Diferencial", semestreMalla: 2, departamento: "Matemática", horas: [4, 2, 0] },
  { codigo: "210020", nombre: "Química General", semestreMalla: 2, departamento: "Química", horas: [6, 0, 0] },
  { codigo: "620433", nombre: "Programación Orientada al Objeto", semestreMalla: 2, departamento: "Sistemas de Información", horas: [4, 2, 2] },
  { codigo: "620434", nombre: "Estructuras Discretas para Ciencias de la Computación", semestreMalla: 2, departamento: "Sistemas de Información", horas: [4, 0, 0] },
  { codigo: "220145", nombre: "Álgebra Lineal", semestreMalla: 3, departamento: "Matemática", horas: [4, 2, 0] },
  { codigo: "220146", nombre: "Cálculo Integral", semestreMalla: 3, departamento: "Matemática", horas: [4, 2, 0] },
  { codigo: "230033", nombre: "Física Newtoniana", semestreMalla: 3, departamento: "Física", horas: [6, 0, 0] },
  { codigo: "620435", nombre: "Estructuras de Datos", semestreMalla: 3, departamento: "Sistemas de Información", horas: [3, 2, 2] },
  { codigo: "220147", nombre: "Ecuaciones Diferenciales", semestreMalla: 4, departamento: "Matemática", horas: [4, 2, 0] },
  { codigo: "230034", nombre: "Electromagnetismo", semestreMalla: 4, departamento: "Física", horas: [6, 0, 0] },
  { codigo: "220148", nombre: "Cálculo en Varias Variables", semestreMalla: 4, departamento: "Matemática", horas: [4, 2, 0] },
  { codigo: "620436", nombre: "Modelamiento de Procesos e Información", semestreMalla: 4, departamento: "Sistemas de Información", horas: [4, 2, 0] },
  { codigo: "340277", nombre: "Inglés II", semestreMalla: 4, departamento: "Estudios Generales", horas: [4, 0, 0] },
].map(asignatura => ({ ...asignatura, departamento: `Departamento de ${asignatura.departamento}`, carreras: [carrera] }));

export const datosSemestres = [
  { codigo: "2026-1", actual: false },
  { codigo: "2026-2", actual: true },
];
