export const dias = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes"];

// Bloques de 40 minutos desde las 08:10, con descanso de 10 minutos cada dos bloques.
export const modulos = [
  { horaInicio: "08:10", horaTermino: "08:50" },
  { horaInicio: "08:50", horaTermino: "09:30" },
  { horaInicio: "09:40", horaTermino: "10:20" },
  { horaInicio: "10:20", horaTermino: "11:00" },
  { horaInicio: "11:10", horaTermino: "11:50" },
  { horaInicio: "11:50", horaTermino: "12:30" },
  { horaInicio: "12:40", horaTermino: "13:20" },
  { horaInicio: "13:20", horaTermino: "14:00" },
  { horaInicio: "14:10", horaTermino: "14:50" },
  { horaInicio: "14:50", horaTermino: "15:30" },
  { horaInicio: "15:40", horaTermino: "16:20" },
  { horaInicio: "16:20", horaTermino: "17:00" },
  { horaInicio: "17:10", horaTermino: "17:50" },
  { horaInicio: "17:50", horaTermino: "18:30" },
  { horaInicio: "18:40", horaTermino: "19:20" },
  { horaInicio: "19:20", horaTermino: "20:00" },
];

export const datosBloques = dias.flatMap((dia) =>
  modulos.map((modulo, indice) => ({
    dia,
    numeroBloque: indice + 1,
    horaInicio: modulo.horaInicio,
    horaTermino: modulo.horaTermino,
  }))
);

// El dueño de INF100 compartida es explícito en cada fixture, nunca inferido por código.
// profesorOrdinal elige un docente del catálogo ordenado por id; no crea ni elimina personas.
export const datosPlanificacionHorarios = [
  { carrera: "Ingeniería Civil en Informática", periodo: "2026-1", asignaturaCodigo: "INF100", profesorOrdinal: 0, seccion: 1, cupos: 30, dia: "Lunes", numeroBloque: 1, tipoHora: "Teórica", sala: "A101AA", estadoPlanificacion: "publicado" },
  { carrera: "Ingeniería Civil en Informática", periodo: "2026-2", asignaturaCodigo: "INF100", profesorOrdinal: 0, seccion: 1, cupos: 30, dia: "Lunes", numeroBloque: 1, tipoHora: "Teórica", sala: "A101AA", estadoPlanificacion: "preparacion" },
  { carrera: "Ingeniería de Ejecución en Computación e Informática", periodo: "2026-2", asignaturaCodigo: "INF100", profesorOrdinal: 0, seccion: 1, cupos: 25, dia: "Martes", numeroBloque: 1, tipoHora: "Teórica", sala: "A102AA", estadoPlanificacion: "propuesta" },
] as const;

// Institutional classrooms approved for ICINF; laboratories will be added separately.
// Source: Resumen Salas Institucionales UBB al 16.11.2022.xls,
// Salas_Institucionales, columns B/H, rows 7–68 (blank separator rows excluded).
export const datosSalas = [
  { nombre: "A101AA", capacidad: 90, tipo: "Sala" },
  { nombre: "A102AA", capacidad: 90, tipo: "Sala" },
  { nombre: "A103AA", capacidad: 90, tipo: "Sala" },
  { nombre: "A104AA", capacidad: 90, tipo: "Sala" },
  { nombre: "A101AB", capacidad: 90, tipo: "Sala" },
  { nombre: "A102AB", capacidad: 90, tipo: "Sala" },
  { nombre: "A201AB", capacidad: 90, tipo: "Sala" },
  { nombre: "A202AB", capacidad: 90, tipo: "Sala" },
  { nombre: "A301AB", capacidad: 90, tipo: "Sala" },
  { nombre: "A302AB", capacidad: 90, tipo: "Sala" },
  { nombre: "A101AC", capacidad: 70, tipo: "Sala" },
  { nombre: "A102AC", capacidad: 70, tipo: "Sala" },
  { nombre: "A103AC", capacidad: 70, tipo: "Sala" },
  { nombre: "A104AC", capacidad: 70, tipo: "Sala" },
  { nombre: "A105AC", capacidad: 70, tipo: "Sala" },
  { nombre: "A106AC", capacidad: 70, tipo: "Sala" },
  { nombre: "A107AC", capacidad: 32, tipo: "Sala" },
  { nombre: "A108AC", capacidad: 32, tipo: "Sala" },
  { nombre: "A201AC", capacidad: 70, tipo: "Sala" },
  { nombre: "A202AC", capacidad: 70, tipo: "Sala" },
  { nombre: "A203AC", capacidad: 70, tipo: "Sala" },
  { nombre: "A204AC", capacidad: 70, tipo: "Sala" },
  { nombre: "A205AC", capacidad: 70, tipo: "Sala" },
  { nombre: "A206AC", capacidad: 70, tipo: "Sala" },
  { nombre: "A207AC", capacidad: 32, tipo: "Sala" },
  { nombre: "A208AC", capacidad: 32, tipo: "Sala" },
  { nombre: "A301AC", capacidad: 70, tipo: "Sala" },
  { nombre: "A302AC", capacidad: 70, tipo: "Sala" },
  { nombre: "A303AC", capacidad: 70, tipo: "Sala" },
  { nombre: "A304AC", capacidad: 70, tipo: "Sala" },
  { nombre: "A305AC", capacidad: 70, tipo: "Sala" },
  { nombre: "A306AC", capacidad: 70, tipo: "Sala" },
  { nombre: "A307AC", capacidad: 32, tipo: "Sala" },
  { nombre: "A308AC", capacidad: 32, tipo: "Sala" },
  { nombre: "S201AD", capacidad: 48, tipo: "Sala" },
  { nombre: "S202AD", capacidad: 44, tipo: "Sala" },
  { nombre: "S203AD", capacidad: 38, tipo: "Sala" },
  { nombre: "S301AD", capacidad: 48, tipo: "Sala" },
  { nombre: "S302AD", capacidad: 44, tipo: "Sala" },
  { nombre: "S303AD", capacidad: 38, tipo: "Sala" },
  { nombre: "S101II", capacidad: 40, tipo: "Sala" },
  { nombre: "S102II", capacidad: 45, tipo: "Sala" },
  { nombre: "S103II", capacidad: 45, tipo: "Sala" },
  { nombre: "S101ExIM", capacidad: 35, tipo: "Sala" },
  { nombre: "S102ExIM", capacidad: 20, tipo: "Sala" },
  { nombre: "S103ExIM", capacidad: 42, tipo: "Sala" },
  { nombre: "A101EG", capacidad: 90, tipo: "Sala" },
  { nombre: "S204EG", capacidad: 45, tipo: "Sala" },
  { nombre: "S205EG", capacidad: 60, tipo: "Sala" },
  { nombre: "S206EG", capacidad: 60, tipo: "Sala" },
  { nombre: "S208EG", capacidad: 60, tipo: "Sala" },
  { nombre: "S209EG", capacidad: 60, tipo: "Sala" },
  { nombre: "S210EG", capacidad: 60, tipo: "Sala" },
  { nombre: "S211EG", capacidad: 60, tipo: "Sala" },
  { nombre: "S212EG", capacidad: 60, tipo: "Sala" },
  { nombre: "S213EG", capacidad: 60, tipo: "Sala" },
];
