import { esquemaSalida, type EntradaOptimizacion, type ValidacionSalidaOptimizacion } from "./contrato.js";
import { clave } from "./entrada.js";

export function validarSalidaOptimizacion(entrada: EntradaOptimizacion, salida: unknown): ValidacionSalidaOptimizacion {
  const errores: string[] = [];
  const reservas = new Set(entrada.reservas);
  const profesores = [...new Set(entrada.ofertas.flatMap(o => o.componentes.map(c => c.profesorId!)))];
  const disponibilidadDocente = profesores.map(profesorId => ({ profesorId,
    bloquesDisponibles: entrada.disponibilidades.filter(d => d.profesorId === profesorId && !reservas.has(d.bloqueId)).length,
  })).sort((a, b) => a.bloquesDisponibles - b.bloquesDisponibles || a.profesorId - b.profesorId);
  const requerimientos = entrada.ofertas.flatMap(o => o.componentes.map(c => ({ ...c, ofertaId: o.id, cupos: o.cupos })));
  const faltantes = requerimientos.map(r => ({ ofertaId: r.ofertaId, tipoHoraId: r.tipoHoraId, horas: r.horas }));
  const responder = (completa = false): ValidacionSalidaOptimizacion => ({ valida: errores.length === 0,
    completa: completa && errores.length === 0, errores: [...new Set(errores)], faltantes: faltantes.filter(f => f.horas > 0), disponibilidadDocente });
  const lectura = esquemaSalida.safeParse(salida);
  if (!lectura.success) { errores.push("Salida de optimización inválida."); return responder(); }
  const resultado = lectura.data;
  if (resultado.revision !== entrada.revision) errores.push("Revisión de salida distinta de la entrada.");
  if (resultado.objetivo === null) {
    if (resultado.estado === "optimo" || resultado.estado === "factible" || resultado.asignaciones.length || resultado.faltantes.length || resultado.protecciones.length) {
      errores.push("Salida sin solución contiene valores o estado incompatibles.");
    }
    return responder();
  }
  if (resultado.estado === "infactible" || resultado.estado === "sin_solucion") errores.push("Estado incompatible con una solución.");
  const bloques = new Map(entrada.bloques.map(b => [b.id, b]));
  const recursos = new Map(entrada.recursos.map(r => [r.id, r]));
  const requisitos = new Map(requerimientos.map(r => [clave(r.ofertaId, r.tipoHoraId), r]));
  const disponibilidad = new Set(entrada.disponibilidades.map(d => clave(d.profesorId, d.bloqueId)));
  const asignaciones = new Map<string, typeof resultado.asignaciones>();
  const usoRecursos = new Map<string, number>();
  const usoDocentes = new Set<string>();
  const ocupacionGestionada = new Map<number, Set<number>>();
  const ocupacionTotal = new Map<number, Set<number>>();
  for (const e of entrada.externos) {
    const ocupados = ocupacionTotal.get(e.ofertaId) ?? new Set<number>();
    ocupados.add(e.bloqueId); ocupacionTotal.set(e.ofertaId, ocupados);
  }
  for (const a of resultado.asignaciones) {
    const identificador = clave(a.ofertaId, a.tipoHoraId);
    const requisito = requisitos.get(identificador), bloque = bloques.get(a.bloqueId), recurso = recursos.get(a.categoriaId);
    if (!requisito || !bloque || !recurso) { errores.push("Asignación fuera del dominio de entrada."); continue; }
    const filas = asignaciones.get(identificador) ?? []; filas.push(a); asignaciones.set(identificador, filas);
    if (recurso.capacidad < requisito.cupos || recurso.tipo !== (requisito.tipo === "L" ? "Laboratorio" : "Sala")) errores.push("Categoría incompatible con el componente o sus cupos.");
    if (reservas.has(a.bloqueId)) errores.push("Asignación en bloque reservado.");
    if (!disponibilidad.has(clave(requisito.profesorId!, a.bloqueId))) errores.push("Asignación fuera de disponibilidad docente.");
    const claveDocente = clave(requisito.profesorId!, a.bloqueId);
    if (usoDocentes.has(claveDocente)) errores.push("Colisión de docentes gestionados.");
    usoDocentes.add(claveDocente);
    const claveRecurso = clave(a.categoriaId, a.bloqueId);
    const cantidad = (usoRecursos.get(claveRecurso) ?? 0) + 1; usoRecursos.set(claveRecurso, cantidad);
    if (cantidad > recurso.cantidad) errores.push("Cantidad de recursos excedida.");
    const gestionados = ocupacionGestionada.get(a.ofertaId) ?? new Set<number>();
    if (gestionados.has(a.bloqueId)) errores.push("Actividades simultáneas de una sección.");
    gestionados.add(a.bloqueId); ocupacionGestionada.set(a.ofertaId, gestionados);
    const totales = ocupacionTotal.get(a.ofertaId) ?? new Set<number>();
    if (totales.has(a.bloqueId)) errores.push("Ocupación académica simultánea de una sección.");
    totales.add(a.bloqueId); ocupacionTotal.set(a.ofertaId, totales);
  }
  const faltantesDeclarados = new Map<string, number>();
  for (const f of resultado.faltantes) {
    const identificador = clave(f.ofertaId, f.tipoHoraId);
    if (!requisitos.has(identificador) || faltantesDeclarados.has(identificador)) errores.push("Faltante duplicado o fuera del dominio.");
    faltantesDeclarados.set(identificador, f.horas);
  }
  for (const f of faltantes) {
    const identificador = clave(f.ofertaId, f.tipoHoraId);
    const filas = asignaciones.get(identificador) ?? [];
    f.horas -= filas.length;
    if (f.horas < 0 || faltantesDeclarados.get(identificador) !== f.horas) errores.push("Cobertura o faltantes del componente inconsistentes.");
    const porDia = new Map<string, Map<number, string>>();
    for (const a of filas) {
      const b = bloques.get(a.bloqueId)!;
      const numeros = porDia.get(b.dia) ?? new Map<number, string>();
      if (numeros.has(b.numeroBloque)) errores.push("Componente duplicado en un bloque.");
      numeros.set(b.numeroBloque, a.categoriaId); porDia.set(b.dia, numeros);
    }
    for (const numeros of porDia.values()) for (let b = 1; b <= 16; b++) {
      if (!numeros.has(b)) continue;
      if (b % 2 === 0 && !numeros.has(b - 1)) errores.push("Secuencia iniciada en bloque par.");
      if (b % 2 === 1 && !numeros.has(b - 1) && !numeros.has(b + 1)) errores.push("Secuencia de menos de dos bloques.");
      if (numeros.has(b + 1) && numeros.get(b + 1) !== numeros.get(b)) errores.push("Categoría discontinua dentro de un componente.");
    }
  }
  for (const ocupados of ocupacionGestionada.values()) {
    for (const dia of new Set(entrada.bloques.map(b => b.dia))) {
      const numeros = new Set([...ocupados].map(id => bloques.get(id)!).filter(b => b.dia === dia).map(b => b.numeroBloque));
      for (let b = 2; b <= 16; b += 2) if (numeros.has(b) && !numeros.has(b - 1)) errores.push("Sección iniciada en bloque par.");
      for (let b = 1; b <= 12; b++) if ([0, 1, 2, 3, 4].every(i => numeros.has(b + i))) errores.push("Más de cuatro bloques continuos por sección.");
    }
  }
  const protecciones = new Map<string, boolean>();
  const dominios = new Set(entrada.parejas.flatMap(p => p.seccionesA.flatMap(a => p.seccionesB.map(b => clave(p.id, a, b)))));
  for (const p of resultado.protecciones) {
    const identificador = clave(p.parejaId, p.ofertaAId, p.ofertaBId);
    if (!dominios.has(identificador) || protecciones.has(identificador)) errores.push("Protección duplicada o fuera del dominio.");
    protecciones.set(identificador, p.protegida);
  }
  let penalidadFlexible = 0;
  for (const pareja of entrada.parejas) {
    let protegidas = 0;
    for (const a of pareja.seccionesA) for (const b of pareja.seccionesB) {
      const protegida = protecciones.get(clave(pareja.id, a, b));
      if (protegida === undefined) errores.push("Falta una protección declarada.");
      if (protegida) {
        protegidas++;
        if ([...(ocupacionTotal.get(a) ?? [])].some(bloque => ocupacionTotal.get(b)?.has(bloque))) errores.push("Combinación protegida con tope académico.");
      } else if (pareja.status === 0.5) penalidadFlexible += 0.5;
    }
    if (pareja.status === 1 && protegidas < Math.ceil(0.5 * pareja.seccionesA.length * pareja.seccionesB.length)) errores.push("Protección del 50 % incumplida.");
  }
  const objetivo = 1000 * faltantes.reduce((suma, f) => suma + f.horas, 0) + penalidadFlexible;
  if (Math.abs(objetivo - resultado.objetivo) > 1e-5) errores.push("Objetivo distinto de los pesos 1000/1 y las protecciones declaradas.");
  return responder(faltantes.every(f => f.horas === 0));
}
