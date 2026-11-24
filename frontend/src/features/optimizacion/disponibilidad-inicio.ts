import { ApiError } from '../../lib/api';
import type { DocenteSinDisponibilidad } from './types';

// Identifica el rechazo por su código, no por el texto mostrado al usuario.
export function leerDocentesSinDisponibilidad(error: unknown): DocenteSinDisponibilidad[] | undefined {
  if (!(error instanceof ApiError) || error.status !== 409) return;
  const detalle = error.detalle;
  if (!detalle || typeof detalle !== 'object' || !('codigo' in detalle) || detalle.codigo !== 'disponibilidad_no_registrada'
    || !('docentesSinDisponibilidad' in detalle) || !Array.isArray(detalle.docentesSinDisponibilidad)) return;
  const docentes = detalle.docentesSinDisponibilidad;
  if (docentes.length && docentes.every(docente => docente && Number.isSafeInteger(docente.profesorId)
    && typeof docente.nombre === 'string' && Number.isSafeInteger(docente.minimoBloques) && docente.minimoBloques > 0
    && docente.bloquesEnviados === 0)) return docentes;
}
