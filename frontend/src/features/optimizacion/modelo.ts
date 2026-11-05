import type { BorradorRecurso, CategoriaSala, Disponibilidad, Ejecucion, Recurso } from './types';
import type { PlanificacionSemestre } from '../asignaturas/types';

export const capacidadLaboratoriosModelo = 60;
export const cantidadInicialLaboratoriosModelo = 6;
export const categoriaLaboratoriosModelo = {
  id: 'laboratorios-modelo', edificio: 'Laboratorios del modelo',
  fuente: `Supuesto del modelo: capacidad fija de ${capacidadLaboratoriosModelo} estudiantes, cantidad declarada para esta ejecución, no inventario físico.`,
};
export function crearLaboratoriosModelo(cantidad = String(cantidadInicialLaboratoriosModelo)): BorradorRecurso {
  return { ...categoriaLaboratoriosModelo, capacidad: String(capacidadLaboratoriosModelo), cantidad };
}
export function planificacionesModelo(planificaciones: PlanificacionSemestre[], rol?: string): PlanificacionSemestre[] {
  if (rol === 'admin') return planificaciones;
  if (rol !== 'secretaria') return [];
  // La identidad pública no expone carreraId, el catálogo ya viene autorizado por el backend.
  if (new Set(planificaciones.map(p => p.carreraId)).size !== 1) return [];
  const actuales = planificaciones.filter(p => p.actual);
  return actuales.length === 1 ? actuales : [];
}
export function fechaEjecucion(valor: string) {
  const fecha = new Date(valor);
  return Number.isNaN(fecha.getTime()) ? 'Fecha no disponible' : fecha.toLocaleString('es-CL');
}

export const puedeOptimizar = (rol?: string | null) => rol === 'admin' || rol === 'secretaria';
export const etiquetasEstado = {
  en_ejecucion: 'En ejecución', aplicada: 'Incorporada como Propuesta', infactible: 'Sin solución factible',
  carga_incompleta: 'Carga incompleta', limite_tiempo: 'Límite de tiempo sin incorporación', error: 'Error',
  interrumpida: 'Ejecución interrumpida', datos_desactualizados: 'Datos desactualizados',
};
export const ordenarDisponibilidad = (filas: Disponibilidad[]) => [...filas].sort((a, b) => a.bloquesDisponibles - b.bloquesDisponibles || a.profesorId - b.profesorId);
export const rutaModelo = (id: number) => `/app/optimizacion?planificacion=${id}`;
export const rutaResultados = (id: number) => `/app/resultados-horarios?planificacion=${id}`;
export function destinoAlTerminar(ejecucion: Ejecucion, ruta: string, consulta: string) {
  return ejecucion.estado === 'aplicada' && ruta === '/app/optimizacion'
    && new URLSearchParams(consulta).get('planificacion') === String(ejecucion.planificacionSemestreId) ? 'redirigir' : 'notificar';
}
export const sugerirRecursos = (categorias: CategoriaSala[]): BorradorRecurso[] => categorias.map(c => ({
  id: c.id, edificio: c.edificio, capacidad: String(c.capacidad), cantidad: String(c.cantidadSugerida), fuente: c.fuente,
}));
function entero(valor: string, minimo: number, nombre: string) {
  const numero = Number(valor);
  if (!/^\d+$/.test(valor) || !Number.isSafeInteger(numero) || numero < minimo || numero > 10000) throw new Error(`${nombre}: ingresa un entero entre ${minimo} y 10000.`);
  return numero;
}
export function prepararRecursos(categorias: CategoriaSala[], salas: BorradorRecurso[], laboratorios: BorradorRecurso[], requiereLaboratorios: boolean): Recurso[] {
  if (requiereLaboratorios && !laboratorios.length) throw new Error('Declara el total departamental de laboratorios por capacidad.');
  const recursos: Recurso[] = salas.map(sala => {
    const categoria = categorias.find(c => c.id === sala.id);
    const cantidad = entero(sala.cantidad, 0, 'Cantidad de salas');
    if (!categoria || cantidad > categoria.cantidadCatalogo) throw new Error('La cantidad no puede superar el catálogo de la categoría.');
    return { id: categoria.id, edificio: categoria.edificio, tipo: 'Sala', capacidad: categoria.capacidad, cantidad, fuente: categoria.fuente };
  });
  for (const laboratorio of laboratorios) {
    const edificio = laboratorio.edificio.trim(), fuente = laboratorio.fuente.trim();
    if (!edificio || edificio.length > 120 || !fuente || fuente.length > 500) throw new Error('Completa edificio y fuente de cada categoría de laboratorio.');
    recursos.push({ id: laboratorio.id, edificio, tipo: 'Laboratorio', capacidad: entero(laboratorio.capacidad, 1, 'Capacidad'), cantidad: entero(laboratorio.cantidad, 0, 'Total de laboratorios'), fuente });
  }
  if (!recursos.length || recursos.length > 200 || new Set(recursos.map(r => r.id)).size !== recursos.length) throw new Error('Declara entre 1 y 200 categorías únicas.');
  return recursos;
}
