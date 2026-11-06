import { crearCalendario } from './modelo';
import type { Bloque, ClaseHorario } from './types';

export interface SesionConsulta {
  clase: ClaseHorario;
  bloques: Bloque[];
}

const minutos = (hora: string) => Number(hora.slice(0, 2)) * 60 + Number(hora.slice(3, 5));
export const horarioSesion = (bloques: Bloque[]) =>
  `${bloques[0].horaInicio.slice(0, 5)}–${bloques[bloques.length - 1].horaTermino.slice(0, 5)}`;

function mismaClase(primera: ClaseHorario, siguiente: ClaseHorario) {
  return primera.ofertaId !== undefined && primera.tipoHoraId !== undefined && primera.salaId !== undefined
    && primera.ofertaId === siguiente.ofertaId && primera.tipoHoraId === siguiente.tipoHoraId
    && primera.salaId === siguiente.salaId && primera.planificacionSemestreId === siguiente.planificacionSemestreId;
}

export function crearCalendarioSesiones(bloques: Bloque[], horarios: ClaseHorario[], planificacionId: number, reservados: number[] = []) {
  const calendario = crearCalendario(bloques, horarios, planificacionId);
  const filas = calendario.filas.map(fila => ({ ...fila, celdas: fila.celdas.map(celda => ({
    ...celda, filas: 1, continuacion: false,
    sesiones: celda.clases.map(clase => ({ clase, bloques: [celda.bloque!] } as SesionConsulta)),
  })) }));
  for (let dia = 0; dia < calendario.dias.length; dia++) {
    for (let indice = 0; indice < filas.length; indice++) {
      const inicio = filas[indice].celdas[dia];
      if (!inicio.continuacion && inicio.bloque && inicio.sesiones.length === 0 && reservados.includes(inicio.bloque.id)) {
        let anterior = inicio.bloque;
        for (let siguiente = indice + 1; siguiente < filas.length; siguiente++) {
          const celda = filas[siguiente].celdas[dia];
          if (!celda.bloque || celda.sesiones.length > 0 || !reservados.includes(celda.bloque.id)
            || celda.bloque.numeroBloque !== anterior.numeroBloque + 1) break;
          const pausa = minutos(celda.bloque.horaInicio) - minutos(anterior.horaTermino);
          if (pausa !== 0 && pausa !== 10) break;
          inicio.filas++;
          celda.continuacion = true;
          anterior = celda.bloque;
        }
        continue;
      }
      if (inicio.continuacion || !inicio.bloque || inicio.sesiones.length !== 1 || reservados.includes(inicio.bloque.id)) continue;
      const sesion = inicio.sesiones[0];
      for (let siguiente = indice + 1; siguiente < filas.length; siguiente++) {
        const celda = filas[siguiente].celdas[dia];
        const anterior = sesion.bloques[sesion.bloques.length - 1];
        if (!celda.bloque || celda.sesiones.length !== 1 || reservados.includes(celda.bloque.id)
          || celda.bloque.numeroBloque !== anterior.numeroBloque + 1
          || !mismaClase(sesion.clase, celda.sesiones[0].clase)) break;
        const pausa = minutos(celda.bloque.horaInicio) - minutos(anterior.horaTermino);
        if (pausa !== 0 && pausa !== 10) break;
        sesion.bloques.push(celda.bloque);
        inicio.filas++;
        celda.continuacion = true;
      }
    }
  }
  return { dias: calendario.dias, filas };
}
