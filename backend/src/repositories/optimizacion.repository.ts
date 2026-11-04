import { randomUUID, createHash } from "node:crypto";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "../config/db.js";
import { carreras, carreraAsignatura, carreraDepartamento, planificacionesSemestres, ofertasAsignaturas,
  disponibilidadProfesores, horariosAsignaturas, asignaturas, asignaturaTipoHora, profesores, salas,
  bloquesHorarios, tiposHora } from "../db/schema/index.js";
import { ejecucionesOptimizacion, type EstadoEjecucion } from "../db/schema/ejecuciones-optimizacion.schema.js";
import { leerBloquesReservados } from "./bloques-reservados.js";
import type { TransaccionPlanificacion } from "./planificacion-escritura.js";
import { recuperarEjecucionesVencidas, exigirSinEjecucionActiva } from "./optimizacion-bloqueos.js";
import { BadRequestError, ForbiddenError, NotFoundError, ConflictError } from "../utils/errors.js";
import type { AlcanceCarrera } from "../utils/alcance-carrera.js";
import { exigirInicioOptimizacion, resolverIdempotencia } from "../utils/optimizacion-ejecuciones.js";
import type { InicioOptimizacionDTO } from "../validations/optimizacion.validation.js";
import { inicioOptimizacion } from "../validations/optimizacion.validation.js";
import { cargarContextoResultado } from "./resultados-horarios.repository.js";
import { validarPropuestaResultado } from "../utils/resultados-horarios.js";

function canonico(valor: unknown): unknown {
  if (Array.isArray(valor)) return valor.map(canonico).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  if (valor !== null && typeof valor === "object") return Object.fromEntries(Object.entries(valor).sort(([a], [b]) => a.localeCompare(b)).map(([clave, contenido]) => [clave, canonico(contenido)]));
  return valor;
}
export function huellaOptimizacion(valor: unknown) { return createHash("sha256").update(JSON.stringify(canonico(valor))).digest("hex"); }

async function bloquearPlanificacion(tx: TransaccionPlanificacion, id: number, alcance?: AlcanceCarrera) {
  const inicial = await tx.query.planificacionesSemestres.findFirst({ where: eq(planificacionesSemestres.id, id) });
  if (!inicial) throw new NotFoundError("Planificación no encontrada.");
  if (alcance && alcance.carreraId !== inicial.carreraId) throw new ForbiddenError("La planificación no pertenece a su carrera.");
  const [carrera] = await tx.select().from(carreras).where(eq(carreras.id, inicial.carreraId)).for("update");
  const [planificacion] = await tx.select().from(planificacionesSemestres).where(eq(planificacionesSemestres.id, id)).for("update");
  if (!carrera || !planificacion || planificacion.carreraId !== inicial.carreraId) throw new ConflictError("La planificación cambió. Consulte nuevamente.");
  if (carrera.nombre.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase() !== "ingenieria civil en informatica") {
    throw new BadRequestError("La integración del modelo está habilitada exclusivamente para ICINF.");
  }
  return { planificacion, carrera };
}

export async function capturarEntradasOptimizacion(tx: TransaccionPlanificacion, id: number) {
  const planificacion = await tx.query.planificacionesSemestres.findFirst({ where: eq(planificacionesSemestres.id, id) });
  if (!planificacion) throw new NotFoundError("Planificación no encontrada.");
  const relaciones = await tx.query.carreraDepartamento.findMany({ where: eq(carreraDepartamento.carreraId, planificacion.carreraId) });
  const malla = await tx.query.carreraAsignatura.findMany({ where: eq(carreraAsignatura.carreraId, planificacion.carreraId), with: { asignatura: { with: { tiposHora: { with: { tipoHora: true } } } } } });
  const ofertas = await tx.query.ofertasAsignaturas.findMany({ where: eq(ofertasAsignaturas.planificacionSemestreId, id),
    with: { asignatura: { with: { tiposHora: { with: { tipoHora: true } } } }, asignaciones: { with: { tipoHora: true, profesor: { columns: { id: true, departamentoId: true } } } } } });
  const docentesIds = [...new Set(ofertas.flatMap(oferta => oferta.asignaciones.map(asignacion => asignacion.profesorId)))];
  const disponibilidades = docentesIds.length ? await tx.query.disponibilidadProfesores.findMany({ where: and(eq(disponibilidadProfesores.planificacionSemestreId, id), inArray(disponibilidadProfesores.profesorId, docentesIds)) }) : [];
  const horarios = await tx.query.horariosAsignaturas.findMany({ where: eq(horariosAsignaturas.planificacionSemestreId, id) });
  const bloques = await tx.query.bloquesHorarios.findMany();
  const catalogoSalas = await tx.query.salas.findMany();
  const reservas = await leerBloquesReservados(tx, planificacion.carreraId);
  const gestionados = relaciones.filter(relacion => relacion.esGestionado).map(relacion => relacion.departamentoId);
  const datos = { planificacion, relaciones, malla, ofertas, disponibilidades, horarios, bloques, catalogoSalas, reservas, gestionados };
  return { ...datos, revision: huellaOptimizacion(datos), horariosGestionados: horarios.filter(horario => ofertas.some(oferta => oferta.id === horario.ofertaId && gestionados.includes(oferta.asignatura.departamentoId))).length };
}
export type CapturaOptimizacion = Awaited<ReturnType<typeof capturarEntradasOptimizacion>>;

// Solo durante incorporación se toman bloqueos breves de los catálogos relevantes.
async function fijarCatalogos(tx: TransaccionPlanificacion, captura: CapturaOptimizacion) {
  const codigos = [...new Set([...captura.ofertas.map(oferta => oferta.asignaturaCodigo), ...captura.malla.map(fila => fila.asignaturaCodigo)])].sort();
  if (codigos.length) {
    await tx.select({ codigo: asignaturas.codigo }).from(asignaturas).where(inArray(asignaturas.codigo, codigos)).orderBy(asignaturas.codigo).for("share");
    await tx.select().from(asignaturaTipoHora).where(inArray(asignaturaTipoHora.asignaturaCodigo, codigos)).for("share");
  }
  const docentes = [...new Set(captura.ofertas.flatMap(oferta => oferta.asignaciones.map(asignacion => asignacion.profesorId)))].sort((a, b) => a - b);
  if (docentes.length) await tx.select({ id: profesores.id }).from(profesores).where(inArray(profesores.id, docentes)).orderBy(profesores.id).for("share");
  await tx.select().from(salas).orderBy(salas.id).for("share");
  await tx.select().from(bloquesHorarios).orderBy(bloquesHorarios.id).for("share");
  await tx.select().from(tiposHora).orderBy(tiposHora.id).for("share");
}

export const optimizacionRepository = {
  async preparar(id: number, alcance?: AlcanceCarrera) {
    await recuperarEjecucionesVencidas(db);
    return db.transaction(async tx => {
      await bloquearPlanificacion(tx, id, alcance);
      const captura = await capturarEntradasOptimizacion(tx, id);
      const [activa] = await tx.select().from(ejecucionesOptimizacion).where(and(eq(ejecucionesOptimizacion.planificacionSemestreId, id), eq(ejecucionesOptimizacion.estado, "en_ejecucion"))).limit(1);
      return { captura, activa: activa?.id ?? null };
    });
  },
  async iniciar(id: number, parametros: InicioOptimizacionDTO, propietario: string, versionModelo: string,
    adaptar: (captura: CapturaOptimizacion) => unknown, alcance?: AlcanceCarrera) {
    await recuperarEjecucionesVencidas(db);
    return db.transaction(async tx => {
      await bloquearPlanificacion(tx, id, alcance);
      const revisionSolicitud = huellaOptimizacion(parametros.recursos);
      const [previa] = await tx.select().from(ejecucionesOptimizacion).where(and(eq(ejecucionesOptimizacion.planificacionSemestreId, id), eq(ejecucionesOptimizacion.claveIdempotencia, parametros.claveIdempotencia))).limit(1);
      if (resolverIdempotencia(previa, parametros.claveIdempotencia, revisionSolicitud)) return { ejecucion: previa!, nueva: false };
      const captura = await capturarEntradasOptimizacion(tx, id);
      exigirInicioOptimizacion(captura.planificacion, captura.horariosGestionados);
      await exigirSinEjecucionActiva(tx, [id]);
      const entrada = adaptar(captura);
      const [ejecucion] = await tx.insert(ejecucionesOptimizacion).values({ id: randomUUID(), planificacionSemestreId: id,
        claveIdempotencia: parametros.claveIdempotencia, revisionSolicitud, revisionEntrada: captura.revision, versionModelo,
        propietario, estado: "en_ejecucion", entrada, parametros: { recursos: parametros.recursos, limiteSolverSegundos: 300 },
        vigenteHasta: sql`now() + interval '120 seconds'` }).returning();
      return { ejecucion: ejecucion!, nueva: true };
    }, { isolationLevel: "read committed" });
  },
  async consultar(id: string, alcance?: AlcanceCarrera) {
    await recuperarEjecucionesVencidas(db);
    const [ejecucion] = await db.select({ ejecucion: ejecucionesOptimizacion, carreraId: planificacionesSemestres.carreraId }).from(ejecucionesOptimizacion)
      .innerJoin(planificacionesSemestres, eq(planificacionesSemestres.id, ejecucionesOptimizacion.planificacionSemestreId))
      .where(eq(ejecucionesOptimizacion.id, id)).limit(1);
    if (!ejecucion) throw new NotFoundError("Ejecución no encontrada.");
    if (alcance && alcance.carreraId !== ejecucion.carreraId) throw new ForbiddenError("La ejecución no pertenece a su carrera.");
    return ejecucion.ejecucion;
  },
  async ultima(id: number, alcance?: AlcanceCarrera) {
    const planificacion = await db.query.planificacionesSemestres.findFirst({ where: eq(planificacionesSemestres.id, id) });
    if (!planificacion) throw new NotFoundError("Planificación no encontrada.");
    if (alcance && alcance.carreraId !== planificacion.carreraId) throw new ForbiddenError("La planificación no pertenece a su carrera.");
    const [ultima] = await db.select({ id: ejecucionesOptimizacion.id }).from(ejecucionesOptimizacion)
      .where(eq(ejecucionesOptimizacion.planificacionSemestreId, id)).orderBy(desc(ejecucionesOptimizacion.iniciadaEn), desc(ejecucionesOptimizacion.id)).limit(1);
    return ultima ? this.consultar(ultima.id, alcance) : null;
  },
  async renovar(id: string, propietario: string) {
    const filas = await db.update(ejecucionesOptimizacion).set({ vigenteHasta: sql`now() + interval '120 seconds'` })
      .where(and(eq(ejecucionesOptimizacion.id, id), eq(ejecucionesOptimizacion.propietario, propietario), eq(ejecucionesOptimizacion.estado, "en_ejecucion"), sql`${ejecucionesOptimizacion.vigenteHasta} > now()`)).returning({ id: ejecucionesOptimizacion.id });
    return filas.length === 1;
  },
  async terminar(id: string, propietario: string, estado: Exclude<EstadoEjecucion, "en_ejecucion" | "aplicada">, resultado: unknown, diagnostico: unknown) {
    await db.update(ejecucionesOptimizacion).set({ estado, resultado, diagnostico, finalizadaEn: new Date() })
      .where(and(eq(ejecucionesOptimizacion.id, id), eq(ejecucionesOptimizacion.propietario, propietario), eq(ejecucionesOptimizacion.estado, "en_ejecucion")));
  },
  async aplicar(id: string, propietario: string, resultado: unknown,
    validar: (captura: CapturaOptimizacion, entrada: unknown) => { ofertaId: number; tipoHoraId: number; bloqueId: number; categoriaOptimizacionId?: string }[], diagnostico: Record<string, unknown> = {}) {
    const previa = await this.consultar(id);
    return db.transaction(async tx => {
      await bloquearPlanificacion(tx, previa.planificacionSemestreId);
      const [actual] = await tx.select().from(ejecucionesOptimizacion).where(eq(ejecucionesOptimizacion.id, id)).for("update");
      if (!actual || actual.estado !== "en_ejecucion" || actual.propietario !== propietario || actual.vigenteHasta <= new Date()) return false;
      let captura = await capturarEntradasOptimizacion(tx, actual.planificacionSemestreId);
      await fijarCatalogos(tx, captura);
      captura = await capturarEntradasOptimizacion(tx, actual.planificacionSemestreId);
      if (captura.revision !== actual.revisionEntrada || !captura.planificacion.actual || captura.planificacion.estadoPlanificacion !== "preparacion" || captura.horariosGestionados > 0) {
        await tx.update(ejecucionesOptimizacion).set({ estado: "datos_desactualizados", resultado, diagnostico: { codigo: "datos_desactualizados", mensaje: "Las entradas cambiaron. No se incorporó ningún horario." }, finalizadaEn: new Date() }).where(eq(ejecucionesOptimizacion.id, id));
        return false;
      }
      const horarios = validar(captura, actual.entrada);
      if (!horarios.length) throw new BadRequestError("La salida no contiene horarios gestionados completos.");
      if (horarios.some(horario => !captura.ofertas.some(oferta => oferta.id === horario.ofertaId && captura.gestionados.includes(oferta.asignatura.departamentoId)))) throw new BadRequestError("La salida intenta modificar una oferta externa o ajena al período.");
      await tx.insert(horariosAsignaturas).values(horarios.map(horario => ({ ...horario, salaId: null, ejecucionOptimizacionId: id, planificacionSemestreId: actual.planificacionSemestreId })));
      const contexto = await cargarContextoResultado(tx, actual.planificacionSemestreId, true);
      const parametros = inicioOptimizacion.parse({ recursos: (actual.parametros as InicioOptimizacionDTO).recursos, claveIdempotencia: actual.claveIdempotencia });
      contexto.recursosOptimizacion = { categorias: parametros.recursos, asignaciones: horarios.map(horario => ({ ...horario, categoriaId: horario.categoriaOptimizacionId ?? "" })) };
      const propuesta = validarPropuestaResultado(contexto);
      if (!propuesta.valido) throw new BadRequestError(`La propuesta no supera la validación final: ${propuesta.problemas.map(problema => problema.mensaje).join(" ").slice(0, 1500)}`);
      await tx.update(planificacionesSemestres).set({ estadoPlanificacion: "propuesta" }).where(eq(planificacionesSemestres.id, actual.planificacionSemestreId));
      await tx.update(ejecucionesOptimizacion).set({ estado: "aplicada", resultado, diagnostico: { ...diagnostico, codigo: "aplicada", mensaje: "Solución completa, válida y vigente incorporada como Propuesta. No está publicada." }, finalizadaEn: new Date() }).where(eq(ejecucionesOptimizacion.id, id));
      return true;
    }, { isolationLevel: "read committed" });
  },
  recuperar: () => recuperarEjecucionesVencidas(db),
};
