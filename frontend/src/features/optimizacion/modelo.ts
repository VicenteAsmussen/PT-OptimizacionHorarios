import type { BorradorRecurso, CategoriaSala, Disponibilidad, Ejecucion, Recurso } from './types';
import type { PlanificacionSemestre } from '../../types/periodos';

export const capacidadLaboratoriosModelo = 60;
export const cantidadInicialLaboratoriosModelo = 6;
export const categoriaLaboratoriosModelo = {
  id: 'laboratorios-modelo', edificio: 'Laboratorios del modelo',
  fuente: `Supuesto del modelo: capacidad fija de ${capacidadLaboratoriosModelo} estudiantes, cantidad declarada para esta ejecución, no inventario físico.`,
};
// Prepara la categoría supuesta de laboratorios sin presentarla como inventario físico.
export function crearLaboratoriosModelo(cantidad = String(cantidadInicialLaboratoriosModelo)): BorradorRecurso {
  return { ...categoriaLaboratoriosModelo, capacidad: String(capacidadLaboratoriosModelo), cantidad };
}
// Habilita el modelo solo con un período actual inequívoco de una carrera autorizada.
export function planificacionesModelo(planificaciones: PlanificacionSemestre[], rol?: string): PlanificacionSemestre[] {
  if (rol !== 'secretaria') return [];
  // La identidad pública no expone carreraId, el servidor ya limita el catálogo a las carreras autorizadas.
  if (new Set(planificaciones.map(p => p.carreraId)).size !== 1) return [];
  const actuales = planificaciones.filter(p => p.actual);
  return actuales.length === 1 ? actuales : [];
}
// Presenta la fecha del intento con formato local o indica que no está disponible.
export function fechaEjecucion(valor: string) {
  const fecha = new Date(valor);
  return Number.isNaN(fecha.getTime()) ? 'Fecha no disponible' : fecha.toLocaleString('es-CL');
}

// Reserva la solicitud de optimización para el rol secretaría.
export const puedeOptimizar = (rol?: string | null) => rol === 'secretaria';
export const etiquetasEstado = {
  en_ejecucion: 'En ejecución', aplicada: 'Incorporada como Propuesta', infactible: 'Sin solución factible',
  carga_incompleta: 'Carga incompleta', limite_tiempo: 'Límite de tiempo sin incorporación', error: 'Error',
  interrumpida: 'Ejecución interrumpida', datos_desactualizados: 'Datos desactualizados',
};
// Separa la causa del cálculo de la incorporación y no atribuye límites históricos a HiGHS.
export function resumenDiagnostico(ejecucion: { estado?: string; resultado?: Ejecucion['resultado']; diagnostico: Ejecucion['diagnostico'] }) {
  const proceso = ejecucion.diagnostico?.procesoJulia;
  const estado = ejecucion.estado ?? ejecucion.diagnostico?.codigo;
  const etapas = { arranque: 'arranque', solver: 'llamada al solver' };
  const subfases = { transferencia: 'transferencia del modelo', resolucion: 'resolución' };
  let causa = '';
  if (proceso?.origenFin === 'watchdog') {
    causa = proceso.fase === 'extraccion'
      ? 'El sistema detuvo la ejecución porque se agotó el tiempo para recuperar el resultado.'
      : `Corte externo por tiempo agotado durante ${etapas[proceso.fase]}${proceso.subfaseSolver && proceso.fase === 'solver' ? `, ${subfases[proceso.subfaseSolver]}` : ''}. No es un TIME_LIMIT devuelto por HiGHS.`;
  }
  else if (estado === 'error' || proceso?.origenFin === 'error') causa = 'Error de ejecución o de incorporación del resultado.';
  else if (proceso?.origenFin === 'interrupcion' || estado === 'interrumpida') causa = 'Ejecución interrumpida, sin incorporación.';
  else if (ejecucion.resultado?.estado === 'infactible' || estado === 'infactible') causa = 'Inviabilidad reportada por el modelo.';
  else if (ejecucion.resultado?.estado === 'limite_tiempo') causa = 'El optimizador alcanzó su límite de tiempo. No se pudo confirmar que hubiera encontrado el mejor horario posible.';
  else if (ejecucion.resultado?.estado === 'optimo') causa = 'El optimizador confirmó el mejor resultado según los criterios del modelo.';
  else if (estado === 'limite_tiempo') causa = 'Límite de tiempo registrado sin detalle suficiente para distinguir HiGHS de un corte externo.';
  const incorporacion = estado === 'aplicada' ? 'Se incorporó una propuesta. No está publicada.'
    : estado && estado !== 'en_ejecucion' ? 'No se incorporó una propuesta en este intento.' : '';
  return { causa, incorporacion };
}
// Prioriza en el diagnóstico los docentes con menos bloques disponibles.
export const ordenarDisponibilidad = (filas: Disponibilidad[]) => [...filas].sort((a, b) => a.bloquesDisponibles - b.bloquesDisponibles || a.profesorId - b.profesorId);
// Conserva la planificación al enlazar al seguimiento del modelo.
export const rutaModelo = (id: number) => `/app/optimizacion?planificacion=${id}`;
// Conserva la planificación al enlazar a la gestión del horario generado.
export const rutaResultados = (id: number) => `/app/resultados-horarios?planificacion=${id}`;
// Decide si el fin del cálculo permite redirigir sin interrumpir otra tarea abierta.
export function destinoAlTerminar(ejecucion: Ejecucion, ruta: string, consulta: string) {
  return ejecucion.estado === 'aplicada' && ruta === '/app/optimizacion'
    && new URLSearchParams(consulta).get('planificacion') === String(ejecucion.planificacionSemestreId) ? 'redirigir' : 'notificar';
}
// Convierte las categorías sugeridas en cantidades editables para un nuevo intento.
export const sugerirRecursos = (categorias: CategoriaSala[]): BorradorRecurso[] => categorias.map(c => ({
  id: c.id, edificio: c.edificio, capacidad: String(c.capacidad), cantidad: String(c.cantidadSugerida), fuente: c.fuente,
}));
// Rechaza cantidades de recursos fuera del rango entero permitido por el formulario.
function entero(valor: string, minimo: number, nombre: string) {
  const numero = Number(valor);
  if (!/^\d+$/.test(valor) || !Number.isSafeInteger(numero) || numero < minimo || numero > 10000) throw new Error(`${nombre}: ingresa un entero entre ${minimo} y 10000.`);
  return numero;
}
// Valida las categorías y cantidades declaradas antes de solicitar la ejecución.
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
