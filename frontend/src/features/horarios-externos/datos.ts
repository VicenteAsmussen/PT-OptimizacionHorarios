import type { CoberturaExterna, DepartamentoExterno, ResumenDepartamento } from './types';

// Identifica los departamentos no gestionados asociados a la carrera seleccionada.
export function departamentosExternos(departamentos: DepartamentoExterno[], carreraId?: number) {
  return departamentos.filter(departamento => departamento.carreraDepartamentos.some(
    relacion => relacion.carreraId === carreraId && !relacion.esGestionado));
}

// Resume las asignaturas con carga guardada por cada departamento externo.
export async function cargarResumenDepartamentos(
  planificacionId: number, departamentos: DepartamentoExterno[],
  consultar: (planificacionId: number, departamentoId: number) => Promise<{ cobertura: CoberturaExterna[] }>,
): Promise<ResumenDepartamento[]> {
  return Promise.all(departamentos.map(async departamento => {
    const { cobertura } = await consultar(planificacionId, departamento.id);
    return { departamentoId: departamento.id, nombre: departamento.nombre,
      cargadas: cobertura.filter(asignatura => asignatura.estado === 'cargada').length, total: cobertura.length };
  }));
}

// Explica los fallos de consulta de carga externa conservando el estado HTTP conocido.
export function mensajeErrorCobertura(fallo: unknown): string {
  const mensaje = fallo instanceof Error ? fallo.message : 'No se pudo consultar la carga guardada.';
  const estado = fallo instanceof Error && 'status' in fallo && typeof fallo.status === 'number' ? fallo.status : null;
  if (estado === 404) return 'La consulta de horarios no está disponible en el backend (HTTP 404). Comprueba que el backend esté actualizado y vuelve a intentar.';
  return estado === null ? mensaje : `${mensaje} (HTTP ${estado})`;
}

// Distingue la cobertura persistida de los datos de un archivo todavía no guardado.
export function presentacionCobertura(estado: CoberturaExterna['estado'], sinGuardar: boolean) {
  switch (estado) {
    case 'cargada': return { color: 'verde', texto: sinGuardar ? 'Datos válidos en el archivo (sin guardar)' : 'Cargada' };
    case 'faltante_obligatoria': return { color: 'rojo', texto: 'Obligatoria faltante' };
    case 'faltante_opcional': return { color: 'amarillo', texto: 'Otro semestre, sin carga' };
    case 'invalida': return { color: 'rojo', texto: 'Datos inválidos (sin guardar)' };
  }
}
