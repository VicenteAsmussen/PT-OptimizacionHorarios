import type { AlcanceCarrera } from "../utils/alcance-carrera.js";
import { eq, and, inArray, sql } from "drizzle-orm";
import { db } from "../config/db.js";
import { horariosAsignaturas, type NuevoHorarioAsignatura } from "../db/schema/horarios-asignaturas.schema.js";
import { departamentos } from "../db/schema/departamentos.schema.js";
import { ConflictError } from "../utils/errors.js";
import { ofertasAsignaturas } from "../db/schema/ofertas-asignaturas.schema.js";
import { asignaturas } from "../db/schema/asignaturas.schema.js";
import { profesores, columnasProfesorSinRut } from "../db/schema/profesores.schema.js";
import { salas } from "../db/schema/salas.schema.js";
import { bloquesHorarios } from "../db/schema/bloques-horarios.schema.js";
import { tiposHora } from "../db/schema/tipos-hora.schema.js";
import { planificacionesSemestres } from "../db/schema/planificaciones-semestres.schema.js";
import { planificacionesSemestresRepository } from "./planificaciones-semestres.repository.js";
import { secretarias } from "../db/schema/secretarias.schema.js";
import { carreraAsignatura } from "../db/schema/carrera-asignatura.schema.js";
import { carreraDepartamento } from "../db/schema/carrera-departamento.schema.js";

function condicionAlcanceExcel(carreraId?: number) {
  if (carreraId === undefined) return undefined;
  return inArray(horariosAsignaturas.planificacionSemestreId,
    db.select({ id: planificacionesSemestres.id }).from(planificacionesSemestres).where(eq(planificacionesSemestres.carreraId, carreraId)));
}
const relacionesEntrada = {
  oferta: { with: { asignatura: true as const, profesor: { columns: columnasProfesorSinRut, with: { departamento: true as const } }, planificacionSemestre: true as const } },
  sala: true as const, bloque: true as const, tipoHora: true as const, planificacionSemestre: true as const,
};
const relacionesExcel = {
  oferta: { with: { asignatura: true as const, profesor: { columns: columnasProfesorSinRut } } }, bloque: true as const, tipoHora: true as const,
};
export const horariosRepository = {
  async findContextoExternos(planificacionSemestreId: number, departamentoId: number, carreraId?: number) {
    const planificacion = await planificacionesSemestresRepository.findById(planificacionSemestreId);
    const carreraContexto = planificacion?.carreraId;
    const departamento = await db.query.departamentos.findFirst({ where: eq(departamentos.id, departamentoId) });
    const relacion = carreraContexto === undefined ? undefined : await db.query.carreraDepartamento.findFirst({
      where: and(eq(carreraDepartamento.carreraId, carreraContexto), eq(carreraDepartamento.departamentoId, departamentoId), eq(carreraDepartamento.esGestionado, false)),
    });
    return {
      departamentoValido: !!departamento && !!relacion && (carreraId === undefined || carreraId === carreraContexto),
      asignaturas: carreraContexto === undefined ? [] : await db.select().from(asignaturas).where(and(
        eq(asignaturas.departamentoId, departamentoId),
        inArray(asignaturas.codigo, db.select({ codigo: carreraAsignatura.asignaturaCodigo }).from(carreraAsignatura).where(eq(carreraAsignatura.carreraId, carreraContexto))),
      )),
      profesores: await db.select().from(profesores).where(eq(profesores.departamentoId, departamentoId)),
      tipos: await db.select().from(tiposHora),
      bloques: await db.select().from(bloquesHorarios),
      ofertas: await db.select().from(ofertasAsignaturas).where(eq(ofertasAsignaturas.planificacionSemestreId, planificacionSemestreId)),
      ocupaciones: await db.select({ profesorId: ofertasAsignaturas.profesorId, bloqueId: horariosAsignaturas.bloqueId }).from(horariosAsignaturas)
        .innerJoin(ofertasAsignaturas, eq(ofertasAsignaturas.id, horariosAsignaturas.ofertaId)).where(eq(horariosAsignaturas.planificacionSemestreId, planificacionSemestreId)),
    };
  },
  async crearExternosEnTransaccion(planificacionSemestreId: number, filas: { asignaturaCodigo: string; profesorId: number; seccion: number; cupos: number; sesiones: { bloqueId: number; tipoHoraId: number }[] }[]) {
    await db.transaction(async tx => {
      await tx.execute(sql`LOCK TABLE ofertas_asignaturas IN SHARE ROW EXCLUSIVE MODE`);
      for (const fila of filas) {
        const existente = await tx.query.ofertasAsignaturas.findFirst({ where: and(eq(ofertasAsignaturas.planificacionSemestreId, planificacionSemestreId), eq(ofertasAsignaturas.asignaturaCodigo, fila.asignaturaCodigo), eq(ofertasAsignaturas.seccion, fila.seccion)) });
        if (existente) throw new ConflictError("La oferta ya existe; no se importó ninguna fila.");
        const { sesiones, ...oferta } = fila;
        const [creada] = await tx.insert(ofertasAsignaturas).values({ ...oferta, planificacionSemestreId }).returning();
        for (const sesion of sesiones) await tx.insert(horariosAsignaturas).values({ ...sesion, ofertaId: creada.id, planificacionSemestreId, salaId: null });
      }
      // Una importación real constituye propuesta, sin verdad de publicación por entrada.
      if (filas.some(fila => fila.sesiones.length)) await tx.update(planificacionesSemestres).set({ estadoPlanificacion: "propuesta" })
        .where(and(eq(planificacionesSemestres.id, planificacionSemestreId), eq(planificacionesSemestres.estadoPlanificacion, "preparacion")));
    });
  },
  async findCarreraSecretariaByUsuarioId(usuarioId: number) {
    const [perfil] = await db.select({ carreraId: secretarias.carreraId }).from(secretarias).where(eq(secretarias.usuarioId, usuarioId)).limit(1);
    return perfil;
  },
  async findParaImportarSalas(planificacionSemestreId: number, carreraId?: number) {
    const entradas = await db.query.horariosAsignaturas.findMany({ where: and(eq(horariosAsignaturas.planificacionSemestreId, planificacionSemestreId), condicionAlcanceExcel(carreraId)), with: relacionesExcel });
    const salasExistentes = await db.select({ id: salas.id, nombre: salas.nombre }).from(salas);
    // Conflictos de sala únicamente dentro de esta planificación.
    return { entradas, entradasParaConflictos: entradas, salas: salasExistentes };
  },
  async actualizarSalasEnTransaccion(planificacionSemestreId: number, cambios: { id: number; salaId: number | null }[], carreraId?: number) {
    await db.transaction(async tx => {
      for (const cambio of cambios) {
        const actualizadas = await tx.update(horariosAsignaturas).set({ salaId: cambio.salaId })
          .where(and(eq(horariosAsignaturas.id, cambio.id), eq(horariosAsignaturas.planificacionSemestreId, planificacionSemestreId), condicionAlcanceExcel(carreraId))).returning({ id: horariosAsignaturas.id });
        if (actualizadas.length !== 1) throw new Error("El horario cambió durante la importación; vuelva a exportar e importar.");
      }
    });
  },
  async findPlanificacionById(id: number) {
    return planificacionesSemestresRepository.findById(id);
  },
  async findParaExportarSalas(planificacionSemestreId: number, carreraId?: number) {
    return db.query.horariosAsignaturas.findMany({
      where: and(eq(horariosAsignaturas.planificacionSemestreId, planificacionSemestreId), condicionAlcanceExcel(carreraId)),
      with: { oferta: { with: { asignatura: { with: { tiposHora: { with: { tipoHora: true } } } }, profesor: { columns: columnasProfesorSinRut } } }, bloque: true, tipoHora: true, sala: true },
    });
  },
  async findAll(filtro?: { planificacionSemestreId?: number; ofertaId?: number; salaId?: number; bloqueId?: number; semestreMalla?: number; profesorId?: number }, alcance?: AlcanceCarrera) {
    return db.query.horariosAsignaturas.findMany({
      where: and(
        alcance ? inArray(horariosAsignaturas.planificacionSemestreId, planificacionesSemestresRepository.idsEnCarrera(alcance)) : undefined,
        filtro?.planificacionSemestreId ? eq(horariosAsignaturas.planificacionSemestreId, filtro.planificacionSemestreId) : undefined,
        filtro?.ofertaId ? eq(horariosAsignaturas.ofertaId, filtro.ofertaId) : undefined,
        filtro?.salaId ? eq(horariosAsignaturas.salaId, filtro.salaId) : undefined,
        filtro?.bloqueId ? eq(horariosAsignaturas.bloqueId, filtro.bloqueId) : undefined,
        filtro?.semestreMalla ? inArray(horariosAsignaturas.ofertaId, db.select({ id: ofertasAsignaturas.id }).from(ofertasAsignaturas).innerJoin(asignaturas, eq(ofertasAsignaturas.asignaturaCodigo, asignaturas.codigo)).where(eq(asignaturas.semestreMalla, filtro.semestreMalla))) : undefined,
        filtro?.profesorId ? inArray(horariosAsignaturas.ofertaId, db.select({ id: ofertasAsignaturas.id }).from(ofertasAsignaturas).where(eq(ofertasAsignaturas.profesorId, filtro.profesorId))) : undefined,
      ), with: relacionesEntrada,
    });
  },
  async findById(id: number) {
    return db.query.horariosAsignaturas.findFirst({ where: eq(horariosAsignaturas.id, id), with: relacionesEntrada });
  },
  async findBySalaBloquePlanificacion(salaId: number, bloqueId: number, planificacionSemestreId: number) {
    return db.query.horariosAsignaturas.findFirst({ where: and(eq(horariosAsignaturas.salaId, salaId), eq(horariosAsignaturas.bloqueId, bloqueId), eq(horariosAsignaturas.planificacionSemestreId, planificacionSemestreId)) });
  },
  async findByOfertaBloque(ofertaId: number, bloqueId: number) {
    return db.query.horariosAsignaturas.findFirst({ where: and(eq(horariosAsignaturas.ofertaId, ofertaId), eq(horariosAsignaturas.bloqueId, bloqueId)) });
  },
  async findByProfesorBloquePlanificacion(profesorId: number, bloqueId: number, planificacionSemestreId: number) {
    const [resultado] = await db.select({ id: horariosAsignaturas.id, ofertaId: horariosAsignaturas.ofertaId }).from(horariosAsignaturas)
      .innerJoin(ofertasAsignaturas, eq(horariosAsignaturas.ofertaId, ofertasAsignaturas.id))
      .where(and(eq(ofertasAsignaturas.profesorId, profesorId), eq(horariosAsignaturas.bloqueId, bloqueId), eq(horariosAsignaturas.planificacionSemestreId, planificacionSemestreId))).limit(1);
    return resultado;
  },
  async findOfertaWithDetails(ofertaId: number) {
    return db.query.ofertasAsignaturas.findFirst({ where: eq(ofertasAsignaturas.id, ofertaId), with: { asignatura: true, profesor: { columns: columnasProfesorSinRut }, planificacionSemestre: true } });
  },
  async checkSalaExists(id: number) { return !!await db.query.salas.findFirst({ where: eq(salas.id, id) }); },
  async checkBloqueExists(id: number) { return !!await db.query.bloquesHorarios.findFirst({ where: eq(bloquesHorarios.id, id) }); },
  async checkTipoHoraExists(id: number) { return !!await db.query.tiposHora.findFirst({ where: eq(tiposHora.id, id) }); },
  async checkPlanificacionExists(id: number) { return !!await planificacionesSemestresRepository.findById(id); },
  async create(datos: NuevoHorarioAsignatura) {
    const [creada] = await db.insert(horariosAsignaturas).values(datos).returning();
    return creada;
  },
  async update(id: number, datos: Partial<Omit<NuevoHorarioAsignatura, "id">>) {
    const [actualizada] = await db.update(horariosAsignaturas).set(datos).where(eq(horariosAsignaturas.id, id)).returning();
    return actualizada;
  },
  async delete(id: number) { return !!(await db.delete(horariosAsignaturas).where(eq(horariosAsignaturas.id, id)).returning()).length; },
  async deleteByOferta(ofertaId: number) { return (await db.delete(horariosAsignaturas).where(eq(horariosAsignaturas.ofertaId, ofertaId)).returning()).length; },
  async findProfesorByUsuarioId(usuarioId: number) {
    return db.query.profesores.findFirst({ where: eq(profesores.usuarioId, usuarioId) });
  },
};
