import type { Ejecucion, Recurso, Solicitud } from './types';
import { leerDocentesSinDisponibilidad } from './disponibilidad-inicio';

interface Servicio {
  iniciar: (id: number, datos: Solicitud) => Promise<Ejecucion>;
  consultar: (id: string) => Promise<Ejecucion>;
  ultima: (id: number) => Promise<Ejecucion | null>;
}
interface Almacen { getItem: (clave: string) => string | null; setItem: (clave: string, valor: string) => void; removeItem: (clave: string) => void }
export interface EstadoSeguimiento { ejecucion: Ejecucion | null; error: string; incierta: boolean; enviando: boolean; consultado: boolean }
type Instantanea = Record<number, EstadoSeguimiento>;
// Inicializa el seguimiento de un período sin presumir un intento remoto conocido.
const vacio = (): EstadoSeguimiento => ({ ejecucion: null, error: '', incierta: false, enviando: false, consultado: false });
// Conserva el diagnóstico recibido o explica que el estado del intento no pudo consultarse.
const mensaje = (error: unknown) => error instanceof Error ? error.message : 'No se pudo consultar la ejecución.';

// Conserva el UUID v4 en HTTP, donde el navegador no ofrece randomUUID.
function generarClaveIdempotencia(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

// Coordina intentos por cuenta y período conservando solicitudes de inicio inciertas.
export function crearSeguimiento(servicio: Servicio, almacen: Almacen, cuenta: string) {
  let filas: Instantanea = {};
  let cerrado = false;
  const oyentes = new Set<() => void>();
  const terminales = new Set<(ejecucion: Ejecucion) => void>();
  const pendientes = new Map<number, Promise<Ejecucion>>();
  const consultas = new Map<number, Promise<void>>();
  const versiones = new Map<number, number>();
  const solicitudes = new Map<number, Solicitud>();
  // Separa los intentos recuperables por cuenta y planificación académica.
  const clave = (id: number) => `optimizacion:${cuenta}:${id}`;
  // Recupera la solicitud y los avisos del período sin depender de almacenamiento válido.
  function leerGuardado(id: number): { solicitud?: Solicitud; activa?: string; informada?: string } {
    try { return JSON.parse(almacen.getItem(clave(id)) ?? '{}'); } catch { return {}; }
  }
  // Actualiza la instantánea del intento y comunica sus cambios a las pantallas.
  function publicar(id: number, cambios: Partial<EstadoSeguimiento>) {
    if (cerrado) return;
    filas = { ...filas, [id]: { ...(filas[id] ?? vacio()), ...cambios } };
    oyentes.forEach(oir => oir());
  }
  // Incorpora un estado remoto sin confundir un intento histórico con un inicio incierto.
  function recibir(id: number, ejecucion: Ejecucion | null, inicioConfirmado = false) {
    if (cerrado) return;
    if (ejecucion && ejecucion.planificacionSemestreId !== id) throw new Error('La ejecución no corresponde a la planificación consultada.');
    const anterior = filas[id]?.ejecucion;
    if (anterior && ejecucion?.id === anterior.id && anterior.estado !== 'en_ejecucion' && ejecucion.estado === 'en_ejecucion') return;
    const guardado = leerGuardado(id);
    const activa = ejecucion?.estado === 'en_ejecucion';
    const solicitud = solicitudes.get(id) ?? guardado.solicitud;
    // La última ejecución podría ser histórica, aunque tenga los mismos parámetros.
    // Solo la respuesta del POST con su clave confirma una solicitud incierta.
    const informar = !!ejecucion && !activa && guardado.informada !== ejecucion.id
      && (anterior?.estado === 'en_ejecucion' || guardado.activa === ejecucion.id || inicioConfirmado);
    const incierta = !!solicitud && !inicioConfirmado;
    try {
      if (!ejecucion && !incierta) almacen.removeItem(clave(id));
      else almacen.setItem(clave(id), JSON.stringify({ ...(incierta ? { solicitud } : {}), activa: activa ? ejecucion.id : undefined, informada: informar ? ejecucion.id : guardado.informada }));
    } catch { /* El estado remoto sigue disponible aunque falle el almacenamiento local. */ }
    if (!incierta) solicitudes.delete(id);
    publicar(id, { ejecucion, error: '', consultado: true, incierta });
    if (informar && ejecucion) terminales.forEach(oir => oir(ejecucion));
  }
  // Consulta el intento vigente compartiendo lecturas y descartando versiones superadas.
  function actualizar(id: number): Promise<void> {
    if (cerrado || pendientes.has(id)) return Promise.resolve();
    if (consultas.has(id)) return consultas.get(id)!;
    const version = versiones.get(id) ?? 0;
    const actual = filas[id]?.ejecucion;
    const tarea = Promise.resolve().then(async () => {
      if (actual?.estado !== 'en_ejecucion') return servicio.ultima(id);
      try { return await servicio.consultar(actual.id); }
      catch (error) {
        if (!error || typeof error !== 'object' || !('status' in error) || error.status !== 404) throw error;
        // Otro usuario pudo reiniciar el resultado o sustituir el intento ya finalizado.
        return servicio.ultima(id);
      }
    }).then(ejecucion => {
      if ((versiones.get(id) ?? 0) === version) recibir(id, ejecucion);
    }).catch(error => {
      if ((versiones.get(id) ?? 0) === version) publicar(id, { error: mensaje(error), incierta: !!leerGuardado(id).solicitud || !!solicitudes.get(id) });
    }).finally(() => { consultas.delete(id); });
    consultas.set(id, tarea); return tarea;
  }
  // Conserva clave y recursos antes del POST para recuperar un inicio no confirmado.
  function iniciar(id: number, recursos: Recurso[]): Promise<Ejecucion> {
    if (cerrado) return Promise.reject(new Error('La sesión de seguimiento terminó.'));
    if (pendientes.has(id)) return pendientes.get(id)!;
    if (filas[id]?.ejecucion?.estado === 'en_ejecucion') return Promise.reject(new Error('Hay una ejecución activa.'));
    versiones.set(id, (versiones.get(id) ?? 0) + 1);
    const solicitud = solicitudes.get(id) ?? leerGuardado(id).solicitud ?? { claveIdempotencia: generarClaveIdempotencia(), recursos: structuredClone(recursos) };
    try { almacen.setItem(clave(id), JSON.stringify({ ...leerGuardado(id), solicitud })); }
    catch { return Promise.reject(new Error('Habilita el almacenamiento de sesión para conservar la clave de esta solicitud antes de iniciarla.')); }
    solicitudes.set(id, solicitud);
    publicar(id, { enviando: true, error: '', incierta: false });
    const tarea = Promise.resolve().then(() => servicio.iniciar(id, solicitud)).then(ejecucion => {
      recibir(id, ejecucion, true); return ejecucion;
    }).catch(error => {
      const status = error && typeof error === 'object' && 'status' in error ? Number(error.status) : 0;
      const rechazo = status >= 400 && status < 500 && status !== 408 && status !== 429;
      if (rechazo) {
        solicitudes.delete(id);
        try { almacen.setItem(clave(id), JSON.stringify({ informada: leerGuardado(id).informada })); } catch { /* Conserva el rechazo en memoria. */ }
      }
      // Este rechazo se presenta con tarjetas en el diálogo de inicio.
      publicar(id, { error: leerDocentesSinDisponibilidad(error) ? '' : mensaje(error), incierta: !rechazo }); throw error;
    }).finally(() => { pendientes.delete(id); publicar(id, { enviando: false }); });
    pendientes.set(id, tarea); return tarea;
  }
  return {
    // Expone la instantánea que consumen las pantallas de seguimiento.
    estado: () => filas,
    // Registra cambios de los intentos y permite cancelar la suscripción.
    suscribir: (oir: () => void) => { oyentes.add(oir); return () => { oyentes.delete(oir); }; },
    // Registra avisos de finalización que no se repiten para el mismo intento guardado.
    alTerminar: (oir: (ejecucion: Ejecucion) => void) => { terminales.add(oir); return () => { terminales.delete(oir); }; },
    actualizar, iniciar,
    // Detiene las publicaciones locales sin cancelar el cálculo remoto.
    cerrar: () => { cerrado = true; oyentes.clear(); terminales.clear(); },
  };
}
