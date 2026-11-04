import { createHash } from "node:crypto";
import { DIAS_MODELO, VERSION_MODELO, esquemaDatos, esquemaParametros,
  type DatosOptimizacion, type EntradaOptimizacion, type ParametrosOptimizacion,
  type ParejaOptimizacion } from "./contrato.js";

export function clave(...valores: (string | number)[]): string { return JSON.stringify(valores); }
export function comparar(a: string, b: string): number { return a < b ? -1 : a > b ? 1 : 0; }
function unicos<T>(filas: T[], obtenerClave: (fila: T) => string): T[] {
  return [...new Map(filas.map(fila => [obtenerClave(fila), fila])).values()];
}
function exigirUnicos<T>(filas: T[], obtenerClave: (fila: T) => string): void {
  if (unicos(filas, obtenerClave).length !== filas.length) throw new Error("Entrada con identidades duplicadas.");
}

export function construirEntradaOptimizacion(datos: DatosOptimizacion, parametros: ParametrosOptimizacion = {}): EntradaOptimizacion {
  const resultado = esquemaDatos.safeParse(datos);
  const configuracion = esquemaParametros.safeParse(parametros);
  if (!resultado.success || !configuracion.success) throw new Error("Entrada de optimización inválida.");
  const normalizados = resultado.data;
  normalizados.ofertas.sort((a, b) => a.id - b.id);
  normalizados.ofertas.forEach(o => o.componentes.sort((a, b) => a.tipoHoraId - b.tipoHoraId));
  normalizados.bloques.sort((a, b) => DIAS_MODELO.indexOf(a.dia) - DIAS_MODELO.indexOf(b.dia) || a.numeroBloque - b.numeroBloque);
  normalizados.recursos.sort((a, b) => comparar(a.id, b.id));
  normalizados.disponibilidades = unicos(normalizados.disponibilidades, d => clave(d.profesorId, d.bloqueId))
    .sort((a, b) => a.profesorId - b.profesorId || a.bloqueId - b.bloqueId);
  normalizados.externos = unicos(normalizados.externos, e => clave(e.ofertaId, e.tipoHoraId, e.bloqueId))
    .sort((a, b) => a.ofertaId - b.ofertaId || a.tipoHoraId - b.tipoHoraId || a.bloqueId - b.bloqueId);
  normalizados.reservas = [...new Set(normalizados.reservas)].sort((a, b) => a - b);
  exigirUnicos(normalizados.ofertas, o => clave(o.id));
  exigirUnicos(normalizados.ofertas, o => clave(o.asignaturaCodigo, o.seccion));
  exigirUnicos(normalizados.bloques, b => clave(b.id));
  exigirUnicos(normalizados.bloques, b => clave(b.dia, b.numeroBloque));
  exigirUnicos(normalizados.recursos, r => clave(r.id));
  exigirUnicos(normalizados.recursos, r => clave(r.edificio, r.tipo, r.capacidad));
  if (normalizados.bloques.length !== 80) throw new Error("Se requieren los cinco días y sus 16 bloques completos.");
  const idsBloques = new Set(normalizados.bloques.map(b => b.id));
  if ([...normalizados.reservas, ...normalizados.disponibilidades.map(d => d.bloqueId), ...normalizados.externos.map(e => e.bloqueId)]
    .some(id => !idsBloques.has(id))) throw new Error("Referencia a bloque desconocido.");

  const asignaturas = new Map<string, { nivel: number; critica: boolean; carga?: string }>();
  const identidades = new Map<number, string>();
  const secciones = new Map<string, number>();
  const tiposHora = new Map<number, string>();
  function registrar(id: number, codigo: string, seccion: number, nivel: number, critica: boolean, carga?: string) {
    const identidad = clave(codigo, seccion);
    if ((identidades.has(id) && identidades.get(id) !== identidad) ||
      (secciones.has(identidad) && secciones.get(identidad) !== id)) throw new Error("Identidad de oferta inconsistente.");
    identidades.set(id, identidad); secciones.set(identidad, id);
    const anterior = asignaturas.get(codigo);
    if (anterior && (anterior.nivel !== nivel || (carga !== undefined && anterior.carga !== undefined && anterior.carga !== carga))) {
      throw new Error("Nivel o carga de asignatura inconsistente entre secciones.");
    }
    if (anterior && carga !== undefined && anterior.carga !== undefined && anterior.critica !== critica) {
      throw new Error("Marca crítica inconsistente entre secciones.");
    }
    asignaturas.set(codigo, { nivel, critica: critica || anterior?.critica || false, carga: carga ?? anterior?.carga });
  }
  for (const o of normalizados.ofertas) {
    exigirUnicos(o.componentes, c => clave(c.tipoHoraId));
    exigirUnicos(o.componentes, c => clave(c.tipo));
    for (const c of o.componentes) {
      if (tiposHora.has(c.tipoHoraId) && tiposHora.get(c.tipoHoraId) !== c.tipo) throw new Error("Tipo de componente inconsistente.");
      tiposHora.set(c.tipoHoraId, c.tipo);
      if (c.horas > 0 && c.profesorId === null) throw new Error("Cada componente positivo requiere un docente único.");
    }
    if (!o.requiereSala && o.componentes.some(c => c.horas > 0)) throw new Error("requiereSala=false con carga positiva.");
    registrar(o.id, o.asignaturaCodigo, o.seccion, o.semestreMalla, o.esCritica,
      JSON.stringify(o.componentes.filter(c => c.horas > 0).map(c => [c.tipo, c.horas]).sort()));
  }
  // Registrar antes de deduplicar evita ocultar identidades externas contradictorias.
  for (const e of resultado.data.externos) registrar(e.ofertaId, e.asignaturaCodigo, e.seccion, e.semestreMalla, e.esCritica ?? false);
  for (const e of datos.externos) {
    const identidad = identidades.get(e.ofertaId);
    if (identidad !== clave(e.asignaturaCodigo.trim(), e.seccion) || asignaturas.get(e.asignaturaCodigo.trim())?.nivel !== e.semestreMalla) {
      throw new Error("Identidad de externo inconsistente.");
    }
  }
  const ofertas = normalizados.ofertas.map(o => ({ ...o, componentes: o.componentes.filter(c => c.horas > 0) }))
    .filter(o => o.componentes.length > 0);
  const codigosSecciones = new Map<string, Set<number>>();
  for (const o of [...ofertas.map(o => ({ codigo: o.asignaturaCodigo, id: o.id })),
    ...normalizados.externos.map(e => ({ codigo: e.asignaturaCodigo, id: e.ofertaId }))]) {
    const ids = codigosSecciones.get(o.codigo) ?? new Set<number>(); ids.add(o.id); codigosSecciones.set(o.codigo, ids);
  }
  const codigos = [...codigosSecciones.keys()].sort(comparar);
  const parejas: ParejaOptimizacion[] = [];
  for (let i = 0; i < codigos.length; i++) for (let j = i + 1; j < codigos.length; j++) {
    const a = codigos[i]!, b = codigos[j]!;
    const datosA = asignaturas.get(a)!, datosB = asignaturas.get(b)!;
    const status = datosA.nivel === datosB.nivel ? 1 :
      ((datosA.critica && datosB.nivel === datosA.nivel + 2) || (datosB.critica && datosA.nivel === datosB.nivel + 2)) ? 0.5 : null;
    if (status !== null) parejas.push({ id: `pareja-${parejas.length + 1}`, asignaturaA: a, asignaturaB: b, status,
      seccionesA: [...codigosSecciones.get(a)!].sort((x, y) => x - y), seccionesB: [...codigosSecciones.get(b)!].sort((x, y) => x - y) });
  }
  const cotaPenalidadFlexible = parejas.reduce((suma, p) => suma + (p.status === 0.5 ? 0.5 * p.seccionesA.length * p.seccionesB.length : 0), 0);
  const revision = createHash("sha256").update(JSON.stringify({ version: 1, versionModelo: VERSION_MODELO,
    datos: normalizados, parametros: configuracion.data })).digest("hex");
  return { ...normalizados, ofertas, version: 1, versionModelo: VERSION_MODELO, revision,
    parametros: configuracion.data, parejas, certificadoPrioridad: { cotaPenalidadFlexible, prioridadCertificada: cotaPenalidadFlexible < 1000 } };
}
