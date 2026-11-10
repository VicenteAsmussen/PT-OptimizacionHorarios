import { randomUUID } from "node:crypto";
import { construirEntradaOptimizacion, ejecutarJulia, validarSalidaOptimizacion, prepararCategoriasSalas,
  VERSION_MODELO, type EntradaOptimizacion, type DatosOptimizacion } from "../optimizacion/index.js";
import { optimizacionRepository, type CapturaOptimizacion } from "../repositories/optimizacion.repository.js";
import type { AlcanceCarrera } from "../utils/alcance-carrera.js";
import type { InicioOptimizacionDTO } from "../validations/optimizacion.validation.js";
import type { EjecucionOptimizacion } from "../db/schema/ejecuciones-optimizacion.schema.js";
import { BadRequestError } from "../utils/errors.js";
import { normalizarTipoHoraExcel } from "../utils/excel/excel-comun.js";
import { exigirInicioOptimizacion } from "../utils/optimizacion-ejecuciones.js";

const propietario = randomUUID();
const procesos = new Map<string, { cancelar: AbortController; tarea: Promise<void> }>();
let cerrando = false;

export function adaptarCapturaOptimizacion(captura: CapturaOptimizacion, recursos: InicioOptimizacionDTO["recursos"]): EntradaOptimizacion {
  const catalogo = prepararCategoriasSalas(captura.catalogoSalas);
  for (const recurso of recursos.filter(recurso => recurso.tipo === "Sala")) {
    const categoria = catalogo.categorias.find(categoria => categoria.id === recurso.id);
    if (!categoria || categoria.edificio !== recurso.edificio || categoria.capacidad !== recurso.capacidad || recurso.cantidad > categoria.cantidadCatalogo) {
      throw new BadRequestError("Las salas deben corresponder a categorías acreditadas del catálogo y no superar su cantidad física.");
    }
  }
  const tipos = { teorica: "T", practica: "P", laboratorio: "L" } as const;
  const gestionadas = captura.ofertas.filter(oferta => captura.gestionados.includes(oferta.asignatura.departamentoId));
  for (const oferta of captura.ofertas) {
    if (!captura.malla.some(vinculo => vinculo.asignaturaCodigo === oferta.asignaturaCodigo)) throw new BadRequestError("Una oferta no pertenece a la malla de esta carrera.");
    for (const requisito of oferta.asignatura.tiposHora.filter(tipo => tipo.horas > 0)) {
      const asignacion = oferta.asignaciones.find(asignacion => asignacion.tipoHoraId === requisito.tipoHoraId);
      if (!asignacion || asignacion.profesor.departamentoId !== oferta.asignatura.departamentoId) throw new BadRequestError(`${oferta.asignaturaCodigo}, sección ${oferta.seccion}: falta un docente válido para el componente ${requisito.tipoHoraId}.`);
      if (!captura.gestionados.includes(oferta.asignatura.departamentoId)) {
        const bloques = captura.horarios.filter(horario => horario.ofertaId === oferta.id && horario.tipoHoraId === requisito.tipoHoraId);
        if (bloques.length !== requisito.horas || new Set(bloques.map(bloque => bloque.bloqueId)).size !== bloques.length) {
          throw new BadRequestError(`${oferta.asignaturaCodigo}, sección ${oferta.seccion}: la carga externa del componente ${requisito.tipoHoraId} no está completa.`);
        }
      }
    }
  }
  const ofertas: DatosOptimizacion["ofertas"] = gestionadas.map(oferta => ({ id: oferta.id, asignaturaCodigo: oferta.asignaturaCodigo,
    seccion: oferta.seccion, cupos: oferta.cupos, semestreMalla: oferta.asignatura.semestreMalla, esCritica: oferta.asignatura.esCritica,
    requiereSala: oferta.asignatura.requiereSala, componentes: oferta.asignatura.tiposHora.filter(requisito => requisito.horas > 0).map(requisito => {
      const tipo = tipos[normalizarTipoHoraExcel(requisito.tipoHora.tipo) as keyof typeof tipos];
      if (!tipo) throw new BadRequestError("La carga positiva contiene un tipo de hora no compatible con T/P/L.");
      return { tipoHoraId: requisito.tipoHoraId, tipo, horas: requisito.horas,
        profesorId: oferta.asignaciones.find(asignacion => asignacion.tipoHoraId === requisito.tipoHoraId)?.profesorId ?? null };
    }) }));
  if (!ofertas.some(oferta => oferta.componentes.length > 0)) throw new BadRequestError("No hay ofertas gestionadas con carga horaria para programar.");
  const externos = captura.horarios.filter(horario => !gestionadas.some(oferta => oferta.id === horario.ofertaId)).map(horario => {
    const oferta = captura.ofertas.find(oferta => oferta.id === horario.ofertaId)!;
    if (!oferta || !oferta.asignatura.tiposHora.some(tipo => tipo.tipoHoraId === horario.tipoHoraId && tipo.horas > 0)) throw new BadRequestError("Hay un horario externo sin carga válida en su oferta.");
    if (captura.reservas.includes(horario.bloqueId)) throw new BadRequestError("Un horario externo ocupa un bloque reservado de la carrera.");
    return { ofertaId: oferta.id, asignaturaCodigo: oferta.asignaturaCodigo, seccion: oferta.seccion, semestreMalla: oferta.asignatura.semestreMalla,
      esCritica: oferta.asignatura.esCritica, tipoHoraId: horario.tipoHoraId, bloqueId: horario.bloqueId };
  });
  try {
    return construirEntradaOptimizacion({ ofertas, bloques: captura.bloques as DatosOptimizacion["bloques"],
      disponibilidades: captura.disponibilidades, externos, recursos, reservas: captura.reservas }, { limiteSolverSegundos: 300 });
  } catch (error) {
    throw new BadRequestError(error instanceof Error ? error.message : "No se pudo preparar una entrada válida.");
  }
}

function presentar(ejecucion: EjecucionOptimizacion) {
  return { id: ejecucion.id, planificacionSemestreId: ejecucion.planificacionSemestreId, estado: ejecucion.estado,
    versionModelo: ejecucion.versionModelo, revisionEntrada: ejecucion.revisionEntrada, parametros: ejecucion.parametros,
    iniciadaEn: ejecucion.iniciadaEn, finalizadaEn: ejecucion.finalizadaEn, resultado: ejecucion.resultado, diagnostico: ejecucion.diagnostico };
}

async function calcular(ejecucion: EjecucionOptimizacion, cancelar: AbortController) {
  const entrada = ejecucion.entrada as EntradaOptimizacion;
  let vigente = true;
  let renovando = false;
  const seguimiento = setInterval(() => {
    if (renovando) return;
    renovando = true;
    void optimizacionRepository.renovar(ejecucion.id, propietario).then(renovada => {
      if (!renovada) { vigente = false; cancelar.abort(); }
    }).catch(() => { vigente = false; cancelar.abort(); }).finally(() => { renovando = false; });
  }, 15000);
  seguimiento.unref();
  try {
    const salida = await ejecutarJulia(entrada, { signal: cancelar.signal });
    if (!vigente || cerrando) throw new Error("interrumpida");
    const validacion = validarSalidaOptimizacion(entrada, salida);
    const diagnostico = { ...validacion, faltantes: validacion.faltantes.map(faltante => {
      const oferta = entrada.ofertas.find(oferta => oferta.id === faltante.ofertaId)!;
      return { ...faltante, asignaturaCodigo: oferta.asignaturaCodigo, seccion: oferta.seccion,
        componente: oferta.componentes.find(componente => componente.tipoHoraId === faltante.tipoHoraId)?.tipo };
    }), certificadoPrioridad: entrada.certificadoPrioridad,
      mensaje: "La disponibilidad se ordena como ayuda operativa, no atribuye causas ni garantiza que ampliarla resuelva la falta de solución." };
    if (validacion.valida && validacion.completa && ["optimo", "factible", "limite_tiempo"].includes(salida.estado)) {
      await optimizacionRepository.aplicar(ejecucion.id, propietario, salida, (captura, persistida) => {
        // Reconstruir y validar otra vez las mismas entradas, dentro de la transacción final.
        const recursos = (persistida as EntradaOptimizacion).recursos;
        const actual = adaptarCapturaOptimizacion(captura, recursos);
        if (actual.revision !== entrada.revision) throw new BadRequestError("La revisión matemática cambió antes de incorporar.");
        const revalidada = validarSalidaOptimizacion(actual, salida);
        if (!revalidada.valida || !revalidada.completa) throw new BadRequestError("La solución no supera la validación final completa.");
        return salida.asignaciones.map(({ ofertaId, tipoHoraId, bloqueId, categoriaId }) => ({ ofertaId, tipoHoraId, bloqueId, categoriaOptimizacionId: categoriaId }));
      }, diagnostico);
    } else {
      const estado = !validacion.valida ? "error" : salida.estado === "infactible" ? "infactible" : salida.estado === "limite_tiempo" ? "limite_tiempo" : "carga_incompleta";
      await optimizacionRepository.terminar(ejecucion.id, propietario, estado, salida, diagnostico);
    }
  } catch (error) {
    const mensaje = error instanceof Error ? error.message : "";
    const estado = !vigente || cerrando || cancelar.signal.aborted ? "interrumpida" : mensaje.includes("tiempo de solver") ? "limite_tiempo" : "error";
    await optimizacionRepository.terminar(ejecucion.id, propietario, estado, null, { codigo: estado,
      mensaje: estado === "error" ? "No se obtuvo una salida válida del proceso Julia. No se incorporaron horarios. Compruebe el runtime y el diagnóstico del servidor." : "El cálculo terminó sin una solución completa validada. No se incorporaron horarios.",
      fase: mensaje.includes("arranque") ? "arranque" : mensaje.includes("extracción") ? "extraccion" : mensaje.includes("solver") ? "solver" : "proceso" });
  } finally { clearInterval(seguimiento); procesos.delete(ejecucion.id); }
}

export const optimizacionService = {
  async preparar(id: number, alcance?: AlcanceCarrera) {
    const { captura, activa } = await optimizacionRepository.preparar(id, alcance);
    const categorias = prepararCategoriasSalas(captura.catalogoSalas);
    const bloqueos: string[] = [];
    try { exigirInicioOptimizacion(captura.planificacion, captura.horariosGestionados); } catch (error) { bloqueos.push((error as Error).message); }
    if (activa) bloqueos.push("Hay una ejecución activa en esta planificación.");
    const recursos = categorias.categorias.map(categoria => ({ id: categoria.id, edificio: categoria.edificio, tipo: categoria.tipo,
      capacidad: categoria.capacidad, cantidad: categoria.cantidadSugerida, fuente: categoria.fuente }));
    let entrada: EntradaOptimizacion | undefined;
    try { entrada = adaptarCapturaOptimizacion(captura, recursos); } catch (error) { bloqueos.push((error as Error).message); }
    const requiereLaboratorios = captura.ofertas.some(oferta => captura.gestionados.includes(oferta.asignatura.departamentoId) && oferta.asignatura.tiposHora.some(tipo => normalizarTipoHoraExcel(tipo.tipoHora.tipo) === "laboratorio" && tipo.horas > 0));
    return { planificacion: captura.planificacion, puedeEjecutar: bloqueos.length === 0, bloqueos, ejecucionActivaId: activa,
      revisionEntrada: captura.revision, categoriasSalas: categorias.categorias, diagnosticosCatalogo: categorias.diagnosticos,
      laboratorios: { requiereDeclaracion: requiereLaboratorios, categoriasSugeridas: [], mensaje: "Declare capacidad, cantidad total departamental y fuente por ejecución. No se asumen seis laboratorios de capacidad 60." },
      limiteSolverSegundos: 300, disponibilidadDocente: entrada ? validarSalidaOptimizacion(entrada, null).disponibilidadDocente : [],
      certificadoPrioridad: entrada?.certificadoPrioridad ?? null,
      advertencia: "Las cantidades de salas sugeridas no constituyen disponibilidad garantizada. Deben confirmarse para esta ejecución." };
  },
  async iniciar(id: number, parametros: InicioOptimizacionDTO, alcance?: AlcanceCarrera) {
    if (cerrando) throw new BadRequestError("El backend está cerrando, no se iniciarán nuevas ejecuciones.");
    const { ejecucion, nueva } = await optimizacionRepository.iniciar(id, parametros, propietario, VERSION_MODELO,
      captura => adaptarCapturaOptimizacion(captura, parametros.recursos), alcance);
    if (nueva) {
      const cancelar = new AbortController();
      // La tarea pertenece al backend, no al ciclo de vida de la solicitud HTTP.
      const tarea = calcular(ejecucion, cancelar).catch(() => {
        // Una pérdida de conexión a DB queda recuperable por vencimiento del arrendamiento.
        console.error("No se pudo registrar el término de una ejecución del modelo.");
      });
      procesos.set(ejecucion.id, { cancelar, tarea });
    }
    return { ...presentar(ejecucion), reutilizada: !nueva };
  },
  async consultar(id: string, alcance?: AlcanceCarrera) { return presentar(await optimizacionRepository.consultar(id, alcance)); },
  async ultima(id: number, alcance?: AlcanceCarrera) { const ejecucion = await optimizacionRepository.ultima(id, alcance); return ejecucion ? presentar(ejecucion) : null; },
};

export async function cerrarOptimizacion() {
  cerrando = true;
  for (const proceso of procesos.values()) proceso.cancelar.abort();
  await Promise.allSettled([...procesos.values()].map(proceso => proceso.tarea));
}
