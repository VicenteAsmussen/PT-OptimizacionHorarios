import { claveDia, ordenarBloques } from '../disponibilidad/estado';
import type { Bloque, Movimiento, ResultadoHorario, SesionResultado, ValidacionMovimiento, ValidacionPublicacion } from './types';

export { puedeGestionarResultados } from './permisos';
export const puedeEditarResultado = (resultado: ResultadoHorario) => resultado.planificacion.actual
  && resultado.planificacion.estadoPlanificacion === 'propuesta';
export const sesionesVisibles = (resultado: ResultadoHorario, nivel: string) => resultado.sesiones
  .filter(sesion => !nivel || sesion.asignatura.semestreMalla === Number(nivel));
export const etiquetasSala = { asignada: 'Sala asignada', pendiente: 'Sala pendiente', noRequiere: 'No requiere sala',
  laboratorio: 'Laboratorio', externa: 'Horario externo' };
export const esSesionLista = (sesion: SesionResultado) => sesion.estadoSala === 'externa' || sesion.estadoSala === 'laboratorio'
  || sesion.estadoSala === 'asignada' || sesion.salas.some(sala => sala !== null);
export const puedeMoverSesion = (resultado: ResultadoHorario, sesion: SesionResultado) => puedeEditarResultado(resultado)
  && sesion.editable && !esSesionLista(sesion) && sesion.idsHorarios.length >= 2;
export const etiquetaSesion = (sesion: SesionResultado) => `${sesion.asignatura.nombre}, sección ${sesion.seccion}, ${sesion.tipoHora.tipo}`;
export const rangoBloque = (bloque: Bloque) => `${bloque.horaInicio.slice(0, 5)}–${bloque.horaTermino.slice(0, 5)}`;

export function gruposMovibles(sesion: SesionResultado, bloques: Bloque[]) {
  if (!sesion.editable || sesion.idsHorarios.length < 2) return [];
  const cantidad = sesion.idsHorarios.length;
  const grupos = [[...sesion.idsHorarios]];
  for (let longitud = 2; longitud < cantidad; longitud++) for (let inicio = 0; inicio + longitud <= cantidad; inicio++) {
    const restantes = cantidad - inicio - longitud;
    const segmentos = [sesion.bloquesIds.slice(0, inicio), sesion.bloquesIds.slice(inicio + longitud)].filter(ids => ids.length);
    if ((inicio === 0 || inicio >= 2) && (restantes === 0 || restantes >= 2)
      && segmentos.every(ids => {
        const primero = bloques.find(b => b.id === ids[0]);
        return primero !== undefined && primero.numeroBloque % 2 === 1;
      })) grupos.push(sesion.idsHorarios.slice(inicio, inicio + longitud));
  }
  return grupos;
}
export function inicioParejaDestino(bloques: Bloque[], bloqueId: number) {
  const elegido = bloques.find(bloque => bloque.id === bloqueId);
  if (!elegido) return undefined;
  const numeroInicio = elegido.numeroBloque % 2 === 0 ? elegido.numeroBloque - 1 : elegido.numeroBloque;
  return bloques.find(bloque => claveDia(bloque.dia) === claveDia(elegido.dia) && bloque.numeroBloque === numeroInicio);
}

export function bloquesDestino(bloques: Bloque[], inicioId: number, cantidad: number) {
  const inicio = bloques.find(b => b.id === inicioId);
  if (!inicio || cantidad < 2) return [];
  const grupo = ordenarBloques(bloques).filter(b => claveDia(b.dia) === claveDia(inicio.dia)
    && b.numeroBloque >= inicio.numeroBloque && b.numeroBloque < inicio.numeroBloque + cantidad);
  const minutos = (hora: string) => Number(hora.slice(0, 2)) * 60 + Number(hora.slice(3, 5));
  return grupo.length === cantidad && grupo.every((b, i) => !i || (b.numeroBloque === grupo[i - 1].numeroBloque + 1
    && [0, 10].includes(minutos(b.horaInicio) - minutos(grupo[i - 1].horaTermino)))) ? grupo : [];
}
export function destinoDisponible(resultado: ResultadoHorario, sesion: SesionResultado, inicioId: number, cantidad: number) {
  const grupo = bloquesDestino(resultado.bloques, inicioId, cantidad);
  return grupo.length === cantidad && grupo.every(b => !resultado.bloquesReservadosIds?.includes(b.id)
    && resultado.disponibilidades.some(d => d.profesorId === sesion.profesorId
    && d.planificacionSemestreId === resultado.planificacion.id && d.bloqueId === b.id));
}
export function estadoDestino(resultado: ResultadoHorario, sesion: SesionResultado, inicioId: number, cantidad: number) {
  const inicio = resultado.bloques.find(b => b.id === inicioId);
  if (inicio && inicio.numeroBloque % 2 === 0) return 'inicioPar';
  const grupo = bloquesDestino(resultado.bloques, inicioId, cantidad);
  if (cantidad < 2 || grupo.length !== cantidad) return 'fueraDeRango';
  if (grupo.some(b => resultado.bloquesReservadosIds?.includes(b.id))) return 'reservado';
  const estados = grupo.map(b => estadoCasilla(resultado, sesion, b.id));
  if (estados.includes('ocupado')) return 'ocupado';
  return estados.every(estado => estado === 'disponible') ? 'disponible' : 'sinDisponibilidad';
}
export function estadoCasilla(resultado: ResultadoHorario, sesion: SesionResultado, bloqueId: number) {
  if (resultado.bloquesReservadosIds?.includes(bloqueId)) return 'reservado';
  if (resultado.sesiones.some(otra => otra.bloquesIds.includes(bloqueId)
    && (otra.asignatura.semestreMalla === sesion.asignatura.semestreMalla || otra.profesorId === sesion.profesorId))) return 'ocupado';
  return resultado.disponibilidades.some(d => d.profesorId === sesion.profesorId
    && d.planificacionSemestreId === resultado.planificacion.id && d.bloqueId === bloqueId) ? 'disponible' : 'sinDisponibilidad';
}
export const claveMovimiento = (id: number, datos: Movimiento) => JSON.stringify([id, datos.revision, datos.idsHorarios, datos.bloqueInicioId]);
export function puedeConfirmarMovimiento(resultado: ResultadoHorario, sesion: SesionResultado, datos: Movimiento, validacion: ValidacionMovimiento | null) {
  return puedeMoverSesion(resultado, sesion) && datos.revision === resultado.revision
    && gruposMovibles(sesion, resultado.bloques).some(grupo => JSON.stringify(grupo) === JSON.stringify(datos.idsHorarios))
    && estadoDestino(resultado, sesion, datos.bloqueInicioId, datos.idsHorarios.length) === 'disponible'
    && validacion?.clave === claveMovimiento(resultado.planificacion.id, datos) && validacion.valido && validacion.problemas.length === 0;
}
export const puedePublicar = (resultado: ResultadoHorario, validacion: ValidacionPublicacion | null) => puedeEditarResultado(resultado)
  && validacion?.valido === true && validacion.problemas.length === 0 && validacion.revision === resultado.revision;

interface EstadoResultados { id: number | null; secuencia: number; resultado: ResultadoHorario | null; error: string }
type Accion = { tipo: 'seleccionar'; id: number | null } | { tipo: 'cargado'; secuencia: number; resultado: ResultadoHorario }
  | { tipo: 'fallo'; secuencia: number; mensaje: string };
export const estadoInicial: EstadoResultados = { id: null, secuencia: 0, resultado: null, error: '' };
export function reducirResultados(estado: EstadoResultados, accion: Accion): EstadoResultados {
  if (accion.tipo === 'seleccionar') return { ...estadoInicial, id: accion.id, secuencia: estado.secuencia + 1 };
  if (accion.secuencia !== estado.secuencia) return estado;
  if (accion.tipo === 'fallo') return { ...estado, resultado: null, error: accion.mensaje };
  return accion.resultado.planificacion.id === estado.id ? { ...estado, resultado: accion.resultado, error: '' } : estado;
}
