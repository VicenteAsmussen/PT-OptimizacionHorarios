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

export const datosSalas = [
  { nombre: "Sala A-101", capacidad: 45, tipo: "Sala" },
  { nombre: "Sala A-102", capacidad: 40, tipo: "Sala" },
  { nombre: "Sala B-201", capacidad: 35, tipo: "Sala" },
  { nombre: "Lab Computación 1", capacidad: 30, tipo: "Laboratorio" },
  { nombre: "Lab Computación 2", capacidad: 25, tipo: "Laboratorio" },
  { nombre: "Lab Redes y Hardware", capacidad: 25, tipo: "Laboratorio" },
];
