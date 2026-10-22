import type { CoberturaExterna, DepartamentoExterno, ResumenDepartamento } from './types';

export function departamentosExternos(departamentos: DepartamentoExterno[], carreraId?: number) {
  return departamentos.filter(departamento => departamento.carreraDepartamentos.some(
    relacion => relacion.carreraId === carreraId && !relacion.esGestionado));
}

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

export function mensajeErrorCobertura(fallo: unknown): string {
  const mensaje = fallo instanceof Error ? fallo.message : 'No se pudo consultar la carga guardada.';
  const estado = fallo instanceof Error && 'status' in fallo && typeof fallo.status === 'number' ? fallo.status : null;
  if (estado === 404) return 'La consulta de horarios no está disponible en el backend (HTTP 404). Comprueba que el backend esté actualizado y vuelve a intentar.';
  return estado === null ? mensaje : `${mensaje} (HTTP ${estado})`;
}

export function presentacionCobertura(estado: CoberturaExterna['estado'], sinGuardar: boolean) {
  switch (estado) {
    case 'cargada': return { color: 'verde', texto: sinGuardar ? 'Datos válidos en el archivo (sin guardar)' : 'Cargada' };
    case 'faltante_obligatoria': return { color: 'rojo', texto: 'Obligatoria faltante' };
    case 'faltante_opcional': return { color: 'amarillo', texto: 'Opcional no cargada' };
    case 'invalida': return { color: 'rojo', texto: 'Datos inválidos (sin guardar)' };
  }
}
