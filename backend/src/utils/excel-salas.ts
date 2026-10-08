import type { CellValue } from "exceljs";

export const encabezadosBaseExcelSalas = [
  "Código Asig.", "Sem", "Sección", "Nombre Asignatura", "Hrs. Teóricas",
  "Hrs. Prácticas", "Hrs. Laborat", "Profesor",
] as const;
export const maximoSesionesExcelSalas = 5;
export type NumeroSesionExcelSala = 1 | 2 | 3 | 4 | 5;
export type EncabezadoSesionExcelSala = `${"Día" | "Horario" | "Sala"} ${NumeroSesionExcelSala}`;
export type EncabezadoExcelSala = typeof encabezadosBaseExcelSalas[number] | EncabezadoSesionExcelSala;
export const encabezadosExcelSalas: readonly EncabezadoExcelSala[] = [
  ...encabezadosBaseExcelSalas,
  ...([1, 2, 3, 4, 5] as const).flatMap((numero): EncabezadoSesionExcelSala[] =>
    [`Día ${numero}`, `Horario ${numero}`, `Sala ${numero}`]),
];

export const diasExcelSalas = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"] as const;
export type DiaExcelSala = typeof diasExcelSalas[number];
export type ResultadoExcelSala<T> = { exito: true; valor: T } | { exito: false; error: string };
export interface HorarioExcelSala {
  horaInicio: string;
  horaTermino: string;
}
export interface BloqueExcelSala extends HorarioExcelSala {
  dia: string;
  numeroBloque: number;
}
export interface SesionExcelSala extends HorarioExcelSala {
  dia: DiaExcelSala;
  numerosBloque: number[];
}
export interface FilaExcelSala {
  codigoAsignatura: string;
  sem: string;
  seccion: string;
  nombreAsignatura: string;
  horasTeoricas: number;
  horasPracticas: number;
  horasLaboratorio: number;
  profesor: string;
  sesiones: (HorarioExcelSala & { dia: DiaExcelSala; codigoSala: string })[];
}

/** Usa el resultado almacenado de una fórmula; nunca evalúa fórmulas del archivo. */
export function normalizarTextoCelda(valor: CellValue | undefined): string {
  if (valor === null || valor === undefined) return "";
  if (typeof valor === "object") {
    if ("richText" in valor) return normalizarTextoCelda(valor.richText.map((fragmento) => fragmento.text).join(""));
    if ("text" in valor) return normalizarTextoCelda(valor.text);
    if ("result" in valor) return normalizarTextoCelda(valor.result);
    if ("error" in valor) return valor.error;
    // Una fecha o fórmula sin resultado no representa texto válido de este contrato.
    return "";
  }
  return String(valor).trim().replace(/\s+/g, " ");
}

function sinAcentos(valor: string): string {
  return valor.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

export function normalizarDia(valor: CellValue | undefined): ResultadoExcelSala<DiaExcelSala> {
  const texto = sinAcentos(normalizarTextoCelda(valor));
  const dia = diasExcelSalas.find((candidato) => sinAcentos(candidato) === texto);
  return dia ? { exito: true, valor: dia } : {
    exito: false, error: `Indique un día válido: ${diasExcelSalas.join(", ")}.`,
  };
}

export function normalizarCodigoSala(valor: CellValue | undefined): string {
  return normalizarTextoCelda(valor).toUpperCase().replace(/[-\s]/g, "");
}

function minutosHora(hora: string): number {
  const [horas, minutos] = hora.split(":").map(Number);
  return horas! * 60 + minutos!;
}

export function analizarHorario(valor: CellValue | undefined): ResultadoExcelSala<HorarioExcelSala> {
  const coincidencia = /^(\d{2}:\d{2})\s*-\s*(\d{2}:\d{2})$/.exec(normalizarTextoCelda(valor));
  if (!coincidencia) return { exito: false, error: "Indique el horario en formato HH:MM-HH:MM, por ejemplo 08:10-09:30." };
  const horaInicio = coincidencia[1]!;
  const horaTermino = coincidencia[2]!;
  if (![horaInicio, horaTermino].every((hora) => /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(hora))) {
    return { exito: false, error: "Use horas válidas entre 00:00 y 23:59." };
  }
  if (minutosHora(horaTermino) <= minutosHora(horaInicio)) {
    return { exito: false, error: "La hora de término debe ser posterior a la hora de inicio del mismo día." };
  }
  return { exito: true, valor: { horaInicio, horaTermino } };
}

/** Recibe un rango previamente validado con analizarHorario. */
export function formatearHorario(horario: HorarioExcelSala): string {
  return `${horario.horaInicio}-${horario.horaTermino}`;
}

/**
 * Recibe bloques de una sola asignatura/sección/tipo; el llamador separa esas claves.
 * No trunca a cinco sesiones: el llamador debe reportar el exceso al exportar.
 * La pausa depende del par institucional (2→3, 4→5...), no del tamaño de la sesión.
 */
export function agruparBloquesEnSesiones(bloques: readonly BloqueExcelSala[]): ResultadoExcelSala<SesionExcelSala[]> {
  const normalizados: (BloqueExcelSala & { dia: DiaExcelSala })[] = [];
  const claves = new Set<string>();
  for (const bloque of bloques) {
    const dia = normalizarDia(bloque.dia);
    if (!dia.exito) return dia;
    if (!Number.isInteger(bloque.numeroBloque) || bloque.numeroBloque < 1) {
      return { exito: false, error: "El número de bloque debe ser un entero positivo." };
    }
    const horario = analizarHorario(formatearHorario(bloque));
    if (!horario.exito) return { exito: false, error: `Bloque ${bloque.numeroBloque} (${dia.valor}): ${horario.error}` };
    const clave = `${dia.valor}:${bloque.numeroBloque}`;
    if (claves.has(clave)) return { exito: false, error: `Bloque duplicado: ${bloque.numeroBloque} (${dia.valor}).` };
    claves.add(clave);
    normalizados.push({ dia: dia.valor, numeroBloque: bloque.numeroBloque, ...horario.valor });
  }
  normalizados.sort((primero, segundo) =>
    diasExcelSalas.indexOf(primero.dia) - diasExcelSalas.indexOf(segundo.dia) || primero.numeroBloque - segundo.numeroBloque);

  const sesiones: SesionExcelSala[] = [];
  let anterior: typeof normalizados[number] | undefined;
  for (const bloque of normalizados) {
    const diferencia = anterior ? minutosHora(bloque.horaInicio) - minutosHora(anterior.horaTermino) : -1;
    const pausaPermitida = anterior && anterior.numeroBloque % 2 === 0 && diferencia === 10
      && minutosHora(anterior.horaTermino) - minutosHora(anterior.horaInicio) === 40
      && minutosHora(bloque.horaTermino) - minutosHora(bloque.horaInicio) === 40;
    const continuo = anterior && anterior.dia === bloque.dia && bloque.numeroBloque === anterior.numeroBloque + 1
      && (diferencia === 0 || pausaPermitida);
    if (continuo) {
      const sesion = sesiones[sesiones.length - 1]!;
      sesion.horaTermino = bloque.horaTermino;
      sesion.numerosBloque.push(bloque.numeroBloque);
    } else {
      sesiones.push({ dia: bloque.dia, horaInicio: bloque.horaInicio, horaTermino: bloque.horaTermino, numerosBloque: [bloque.numeroBloque] });
    }
    anterior = bloque;
  }
  return { exito: true, valor: sesiones };
}
