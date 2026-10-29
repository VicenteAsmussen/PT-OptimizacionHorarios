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
  { nombre: "Departamento de Ingeniería Eléctrica y Electrónica" },
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

// OptimizacionHorarios_v3.xlsx: all curriculum courses except Electivos I–VI.
// Department ownership is explicitly confirmed; 612239 was appended but belongs to semester 7.
// Hours are 40-minute academic blocks, ordered theoretical/practical/laboratory.
const carrera = "Ingeniería Civil en Informática";
export const datosAsignaturas = [
  { codigo: "220143", nombre: "Álgebra y Trigonometría", semestreMalla: 1, departamento: "Matemática", horas: [4, 4, 0] },
  { codigo: "620431", nombre: "Introducción a la Programación", semestreMalla: 1, departamento: "Sistemas de Información", horas: [5, 2, 2] },
  { codigo: "620432", nombre: "Introducción a la Ingeniería", semestreMalla: 1, departamento: "Sistemas de Información", horas: [2, 2, 2] },
  { codigo: "340266", nombre: "Comunicación Oral y Escrita", semestreMalla: 1, departamento: "Estudios Generales", horas: [2, 2, 0] },
  { codigo: "220144", nombre: "Cálculo Diferencial", semestreMalla: 2, departamento: "Matemática", horas: [4, 2, 0] },
  { codigo: "210020", nombre: "Química General", semestreMalla: 2, departamento: "Química", horas: [6, 0, 0] },
  { codigo: "620433", nombre: "Programación Orientada al Objeto", semestreMalla: 2, departamento: "Sistemas de Información", horas: [4, 2, 2] },
  { codigo: "620434", nombre: "Estructuras Discretas para Ciencias de la Computación", semestreMalla: 2, departamento: "Sistemas de Información", horas: [4, 2, 0] },
  { codigo: "220145", nombre: "Álgebra Lineal", semestreMalla: 3, departamento: "Matemática", horas: [4, 2, 0] },
  { codigo: "220146", nombre: "Cálculo Integral", semestreMalla: 3, departamento: "Matemática", horas: [4, 2, 0] },
  { codigo: "230033", nombre: "Física Newtoniana", semestreMalla: 3, departamento: "Física", horas: [6, 0, 0] },
  { codigo: "620435", nombre: "Estructuras de Datos", semestreMalla: 3, departamento: "Sistemas de Información", horas: [3, 2, 2] },
  { codigo: "610227", nombre: "Administración General", semestreMalla: 3, departamento: "Administración y Auditoría", horas: [3, 2, 0] },
  { codigo: "340276", nombre: "Inglés I", semestreMalla: 3, departamento: "Estudios Generales", horas: [2, 2, 0] },
  { codigo: "220147", nombre: "Ecuaciones Diferenciales", semestreMalla: 4, departamento: "Matemática", horas: [4, 2, 0] },
  { codigo: "230034", nombre: "Electromagnetismo", semestreMalla: 4, departamento: "Física", horas: [6, 0, 0] },
  { codigo: "220148", nombre: "Cálculo en Varias Variables", semestreMalla: 4, departamento: "Matemática", horas: [4, 2, 0] },
  { codigo: "620436", nombre: "Modelamiento de Procesos e Información", semestreMalla: 4, departamento: "Sistemas de Información", horas: [4, 2, 0] },
  { codigo: "340277", nombre: "Inglés II", semestreMalla: 4, departamento: "Estudios Generales", horas: [2, 2, 0] },
  { codigo: "620437", nombre: "Fundamentos de Ciencias de la Computación", semestreMalla: 5, departamento: "Sistemas de Información", horas: [4, 2, 0] },
  { codigo: "230035", nombre: "Ondas, Óptica y Física Moderna", semestreMalla: 5, departamento: "Física", horas: [6, 0, 0] },
  { codigo: "620438", nombre: "Teoría de Sistemas", semestreMalla: 5, departamento: "Sistemas de Información", horas: [3, 2, 0] },
  { codigo: "610228", nombre: "Gestión Contable", semestreMalla: 5, departamento: "Administración y Auditoría", horas: [3, 2, 0] },
  { codigo: "410268", nombre: "Sistemas Digitales", semestreMalla: 5, departamento: "Ingeniería Eléctrica y Electrónica", horas: [10, 0, 0] },
  { codigo: "340278", nombre: "Inglés III", semestreMalla: 5, departamento: "Estudios Generales", horas: [2, 2, 0] },
  { codigo: "620439", nombre: "Base de Datos", semestreMalla: 6, departamento: "Sistemas de Información", horas: [3, 2, 2] },
  { codigo: "220149", nombre: "Estadistica y Probabilidades", semestreMalla: 6, departamento: "Estadística", horas: [4, 2, 0] },
  { codigo: "620448", nombre: "Análisis y Diseño de Algoritmos", semestreMalla: 6, departamento: "Sistemas de Información", horas: [3, 3, 0] },
  { codigo: "340279", nombre: "Inglés IV", semestreMalla: 6, departamento: "Estudios Generales", horas: [2, 2, 0] },
  { codigo: "611049", nombre: "Economía", semestreMalla: 6, departamento: "Economía y Finanzas", horas: [3, 2, 0] },
  { codigo: "620449", nombre: "Práctica Profesional I", semestreMalla: 6, departamento: "Sistemas de Información", horas: [0, 0, 0] },
  { codigo: "430183", nombre: "Investigación de Operaciones", semestreMalla: 7, departamento: "Ingeniería Industrial", horas: [4, 0, 0] },
  { codigo: "620450", nombre: "Arquitectura de Computadores", semestreMalla: 7, departamento: "Sistemas de Información", horas: [3, 2, 2] },
  { codigo: "620451", nombre: "Administración y Programación de Base de Datos", semestreMalla: 7, departamento: "Sistemas de Información", horas: [3, 2, 2] },
  { codigo: "620452", nombre: "Sistemas de Información", semestreMalla: 7, departamento: "Sistemas de Información", horas: [3, 2, 0] },
  { codigo: "610229", nombre: "Gestión Presupuestaria y Financiera", semestreMalla: 7, departamento: "Administración y Auditoría", horas: [3, 2, 0] },
  { codigo: "612239", nombre: "Gestión Estratégica", semestreMalla: 7, departamento: "Administración y Auditoría", horas: [3, 2, 0] },
  { codigo: "620453", nombre: "Sistemas Operativos", semestreMalla: 8, departamento: "Sistemas de Información", horas: [3, 2, 2] },
  { codigo: "620454", nombre: "Inteligencia Artificial", semestreMalla: 8, departamento: "Sistemas de Información", horas: [3, 2, 0] },
  { codigo: "620455", nombre: "Ingeniería de Software", semestreMalla: 8, departamento: "Sistemas de Información", horas: [4, 2, 0] },
  { codigo: "611050", nombre: "Formulación y Evaluación de Proyectos", semestreMalla: 8, departamento: "Economía y Finanzas", horas: [3, 2, 0] },
  { codigo: "613017", nombre: "Legislación", semestreMalla: 8, departamento: "Administración y Auditoría", horas: [2, 2, 0] },
  { codigo: "620456", nombre: "Práctica Profesional II", semestreMalla: 8, departamento: "Sistemas de Información", horas: [0, 0, 0] },
  { codigo: "620457", nombre: "Comunicación de Datos y Redes", semestreMalla: 9, departamento: "Sistemas de Información", horas: [2, 3, 2] },
  { codigo: "620458", nombre: "Gestión de Proyectos de Software", semestreMalla: 9, departamento: "Sistemas de Información", horas: [3, 2, 0] },
  { codigo: "610231", nombre: "Gestión de Recursos Humanos", semestreMalla: 9, departamento: "Administración y Auditoría", horas: [3, 2, 0] },
  { codigo: "620472", nombre: "Anteproyecto de Titulo", semestreMalla: 9, departamento: "Sistemas de Información", horas: [2, 0, 0] },
  { codigo: "620473", nombre: "Seguridad Informática", semestreMalla: 10, departamento: "Sistemas de Información", horas: [3, 2, 0] },
  { codigo: "620477", nombre: "Proyecto de Titulo", semestreMalla: 10, departamento: "Sistemas de Información", horas: [0, 0, 0] },
].map(asignatura => ({ ...asignatura, departamento: `Departamento de ${asignatura.departamento}`, carreras: [carrera] }));

export const datosSemestres = [
  { codigo: "2026-1", actual: false },
  { codigo: "2026-2", actual: true },
];
