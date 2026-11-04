import type { ContextoResultado, ProblemaResultado } from "./resultados-horarios.js";

/** Una oferta representa una sección completa, nunca una elección independiente de T/P/L. */
export function comprobarCompatibilidadAcademica(contexto: ContextoResultado): ProblemaResultado[] {
  const asignaturas = new Map<string, ContextoResultado["ofertas"]>();
  for (const oferta of contexto.ofertas) {
    if (!oferta.asignatura.tiposHora.some(tipo => tipo.horas > 0)) continue;
    asignaturas.set(oferta.asignaturaCodigo, [...(asignaturas.get(oferta.asignaturaCodigo) ?? []), oferta]);
  }
  const secciones = new Map(contexto.ofertas.map(oferta => {
    const entradas = contexto.entradas.filter(entrada => entrada.ofertaId === oferta.id);
    const completa = oferta.asignatura.tiposHora.every(tipo => entradas.filter(entrada => entrada.tipoHoraId === tipo.tipoHoraId).length === tipo.horas)
      && entradas.every(entrada => oferta.asignatura.tiposHora.some(tipo => tipo.tipoHoraId === entrada.tipoHoraId && tipo.horas > 0));
    return [oferta.id, { completa, bloques: new Set(entradas.map(entrada => entrada.bloqueId)) }] as const;
  }));
  const problemas: ProblemaResultado[] = [];
  const grupos = [...asignaturas.values()];
  for (let indice = 0; indice < grupos.length; indice++) for (const segundas of grupos.slice(indice + 1)) {
    const primeras = grupos[indice]!;
    // Las parejas críticas n→n+2 son flexibles (Status=0,5), nunca un rechazo.
    if (primeras[0]!.asignatura.semestreMalla !== segundas[0]!.asignatura.semestreMalla) continue;
    let compatibles = 0;
    for (const primera of primeras) for (const segunda of segundas) {
      const a = secciones.get(primera.id)!; const b = secciones.get(segunda.id)!;
      if (a.completa && b.completa && ![...a.bloques].some(bloque => b.bloques.has(bloque))) compatibles++;
    }
    const minimo = Math.ceil(0.5 * primeras.length * segundas.length);
    if (compatibles < minimo) problemas.push({ codigo: "nivel",
      mensaje: `${primeras[0]!.asignaturaCodigo} y ${segundas[0]!.asignaturaCodigo}: se requieren al menos ${minimo} combinaciones de secciones completas sin topes y hay ${compatibles}.` });
  }
  return problemas;
}
