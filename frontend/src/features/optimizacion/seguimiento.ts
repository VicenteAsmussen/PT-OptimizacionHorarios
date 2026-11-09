import type { Ejecucion, Recurso, Solicitud } from './types';

interface Servicio {
  iniciar: (id: number, datos: Solicitud) => Promise<Ejecucion>;
  consultar: (id: string) => Promise<Ejecucion>;
  ultima: (id: number) => Promise<Ejecucion | null>;
}
interface Almacen { getItem: (clave: string) => string | null; setItem: (clave: string, valor: string) => void; removeItem: (clave: string) => void }
export interface EstadoSeguimiento { ejecucion: Ejecucion | null; error: string; incierta: boolean; enviando: boolean; consultado: boolean }
type Instantanea = Record<number, EstadoSeguimiento>;
const vacio = (): EstadoSeguimiento => ({ ejecucion: null, error: '', incierta: false, enviando: false, consultado: false });
const mensaje = (error: unknown) => error instanceof Error ? error.message : 'No se pudo consultar la ejecución.';

export function crearSeguimiento(servicio: Servicio, almacen: Almacen, cuenta: string) {
  let filas: Instantanea = {};
  let cerrado = false;
  const oyentes = new Set<() => void>();
  const terminales = new Set<(ejecucion: Ejecucion) => void>();
  const pendientes = new Map<number, Promise<Ejecucion>>();
  const consultas = new Map<number, Promise<void>>();
  const versiones = new Map<number, number>();
  const solicitudes = new Map<number, Solicitud>();
  const clave = (id: number) => `optimizacion:${cuenta}:${id}`;
  function leerGuardado(id: number): { solicitud?: Solicitud; activa?: string; informada?: string } {
    try { return JSON.parse(almacen.getItem(clave(id)) ?? '{}'); } catch { return {}; }
  }
  function publicar(id: number, cambios: Partial<EstadoSeguimiento>) {
    if (cerrado) return;
    filas = { ...filas, [id]: { ...(filas[id] ?? vacio()), ...cambios } };
    oyentes.forEach(oir => oir());
  }
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
  function iniciar(id: number, recursos: Recurso[]): Promise<Ejecucion> {
    if (cerrado) return Promise.reject(new Error('La sesión de seguimiento terminó.'));
    if (pendientes.has(id)) return pendientes.get(id)!;
    if (filas[id]?.ejecucion?.estado === 'en_ejecucion') return Promise.reject(new Error('Hay una ejecución activa.'));
    versiones.set(id, (versiones.get(id) ?? 0) + 1);
    const solicitud = solicitudes.get(id) ?? leerGuardado(id).solicitud ?? { claveIdempotencia: crypto.randomUUID(), recursos: structuredClone(recursos) };
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
      publicar(id, { error: mensaje(error), incierta: !rechazo }); throw error;
    }).finally(() => { pendientes.delete(id); publicar(id, { enviando: false }); });
    pendientes.set(id, tarea); return tarea;
  }
  return {
    estado: () => filas,
    suscribir: (oir: () => void) => { oyentes.add(oir); return () => { oyentes.delete(oir); }; },
    alTerminar: (oir: (ejecucion: Ejecucion) => void) => { terminales.add(oir); return () => { terminales.delete(oir); }; },
    actualizar, iniciar,
    cerrar: () => { cerrado = true; oyentes.clear(); terminales.clear(); },
  };
}
