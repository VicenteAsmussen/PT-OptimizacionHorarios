import type { FilaSeguimiento } from './types';

export const puedeVerSeguimiento = (rol?: string | null) => rol === 'secretaria';
export const estadoEnvio = (enviada: boolean) => enviada ? 'Enviada' : 'No enviada';

interface EstadoSeguimiento {
  planificacionId: number | null;
  revision: number;
  filas: FilaSeguimiento[] | null;
  error: string;
}
type AccionSeguimiento = { tipo: 'seleccionar'; id: number | null } | { tipo: 'recargar' }
  | { tipo: 'cargada'; id: number; revision: number; filas: FilaSeguimiento[] }
  | { tipo: 'fallo'; id: number; revision: number; mensaje: string };
export const estadoInicial: EstadoSeguimiento = { planificacionId: null, revision: 0, filas: null, error: '' };

export function reducirSeguimiento(estado: EstadoSeguimiento, accion: AccionSeguimiento): EstadoSeguimiento {
  if (accion.tipo === 'seleccionar' || accion.tipo === 'recargar') {
    return { planificacionId: accion.tipo === 'seleccionar' ? accion.id : estado.planificacionId,
      revision: estado.revision + 1, filas: null, error: '' };
  }
  if (accion.id !== estado.planificacionId || accion.revision !== estado.revision) return estado;
  return accion.tipo === 'cargada' ? { ...estado, filas: accion.filas, error: '' }
    : { ...estado, filas: null, error: accion.mensaje };
}
