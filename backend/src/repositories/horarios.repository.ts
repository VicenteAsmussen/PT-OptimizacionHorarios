import type { AlcanceCarrera } from "../utils/alcance-carrera.js";
import { eq, and, inArray, ne } from "drizzle-orm";
import { db } from "../config/db.js";
import { horariosAsignaturas, type NuevoHorarioAsignatura } from "../db/schema/horarios-asignaturas.schema.js";
import { departamentos } from "../db/schema/departamentos.schema.js";
import { BadRequestError, ConflictError, NotFoundError } from "../utils/errors.js";
import { conPlanificacionesEditables, exigirVinculoEsperado, type TransaccionPlanificacion } from "./planificacion-escritura.js";
import { ofertasAsignaturas } from "../db/schema/ofertas-asignaturas.schema.js";
import { ofertaTipoHora } from "../db/schema/oferta-tipo-hora.schema.js";
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
import { esObligatoriaExterna } from "../utils/cobertura-externos.js";

async function leerOferta(tx: TransaccionPlanificacion, id: number) {
  const oferta = await tx.query.ofertasAsignaturas.findFirst({ where: eq(ofertasAsignaturas.id, id) });
  if (!oferta) throw new NotFoundError("Oferta no encontrada");
  return oferta;
}
async function leerHorario(tx: TransaccionPlanificacion, id: number) {
  const horario = await tx.query.horariosAsignaturas.findFirst({ where: eq(horariosAsignaturas.id, id) });
  if (!horario) throw new NotFoundError("Horario no encontrado");
  return horario;
}
function exigirMismaPlanificacion(planificacionSemestreId: number, ofertaPlanificacionId: number) {
  if (planificacionSemestreId !== ofertaPlanificacionId) throw new BadRequestError("La planificación indicada no coincide con la planificación de la oferta");
}

async function exigirHorarioValido(tx: TransaccionPlanificacion, datos: NuevoHorarioAsignatura, id?: number) {
  const asignacion = await tx.query.ofertaTipoHora.findFirst({ where: and(eq(ofertaTipoHora.ofertaId, datos.ofertaId), eq(ofertaTipoHora.tipoHoraId, datos.tipoHoraId)) });
  if (!asignacion) throw new BadRequestError("El tipo de hora no tiene profesor asignado en esta oferta");
  const entradas = await tx.select({ id: horariosAsignaturas.id, ofertaId: horariosAsignaturas.ofertaId,
    salaId: horariosAsignaturas.salaId, profesorId: ofertaTipoHora.profesorId }).from(horariosAsignaturas)
    .innerJoin(ofertaTipoHora, and(eq(ofertaTipoHora.ofertaId, horariosAsignaturas.ofertaId), eq(ofertaTipoHora.tipoHoraId, horariosAsignaturas.tipoHoraId)))
    .where(and(eq(horariosAsignaturas.planificacionSemestreId, datos.planificacionSemestreId), eq(horariosAsignaturas.bloqueId, datos.bloqueId), id ? ne(horariosAsignaturas.id, id) : undefined));
  if (entradas.some(e => e.ofertaId === datos.ofertaId)) throw new ConflictError("Conflicto de horario: sección ocupada en este bloque");
  if (entradas.some(e => e.profesorId === asignacion.profesorId)) throw new ConflictError("Conflicto de horario: profesor ocupado en esta planificación");
  if (datos.salaId && entradas.some(e => e.salaId === datos.salaId)) throw new ConflictError("Conflicto de horario: sala ocupada en esta planificación");
}

function condicionAlcanceExcel(carreraId?: number) {
  if (carreraId === undefined) return undefined;
  return inArray(horariosAsignaturas.planificacionSemestreId,
    db.select({ id: planificacionesSemestres.id }).from(planificacionesSemestres).where(eq(planificacionesSemestres.carreraId, carreraId)));
}
const relacionesEntrada = {
  oferta: { with: { asignatura: true as const, planificacionSemestre: true as const } },
  asignacion: { with: { profesor: { columns: columnasProfesorSinRut, with: { departamento: true as const } } } },
  sala: true as const, bloque: true as const, tipoHora: true as const, planificacionSemestre: true as const,
};
const relacionesExcel = {
  oferta: { with: { asignatura: true as const } },
  asignacion: { with: { profesor: { columns: columnasProfesorSinRut } } }, bloque: true as const, tipoHora: true as const,
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
      codigoPeriodo: planificacion?.codigo,
      departamentoValido: !!departamento && !!relacion && (carreraId === undefined || carreraId === carreraContexto),
      asignaturas: carreraContexto === undefined ? [] : await db.select().from(asignaturas).where(and(
        eq(asignaturas.departamentoId, departamentoId),
        inArray(asignaturas.codigo, db.select({ codigo: carreraAsignatura.asignaturaCodigo }).from(carreraAsignatura).where(eq(carreraAsignatura.carreraId, carreraContexto))),
      )),
      profesores: await db.select().from(profesores).where(eq(profesores.departamentoId, departamentoId)),
      tipos: await db.select().from(tiposHora),
      bloques: await db.select().from(bloquesHorarios),
      ofertas: await db.select().from(ofertasAsignaturas).where(eq(ofertasAsignaturas.planificacionSemestreId, planificacionSemestreId)),
      ocupaciones: await db.select({ ofertaId: horariosAsignaturas.ofertaId, profesorId: ofertaTipoHora.profesorId, bloqueId: horariosAsignaturas.bloqueId }).from(horariosAsignaturas)
        .innerJoin(ofertaTipoHora, and(eq(ofertaTipoHora.ofertaId, horariosAsignaturas.ofertaId), eq(ofertaTipoHora.tipoHoraId, horariosAsignaturas.tipoHoraId))).where(eq(horariosAsignaturas.planificacionSemestreId, planificacionSemestreId)),
    };
  },
  async crearExternosEnTransaccion(planificacionSemestreId: number, filas: { asignaturaCodigo: string; profesorId: number; seccion: number; cupos: number; sesiones: { bloqueId: number; tipoHoraId: number }[] }[]) {
    await conPlanificacionesEditables(async () => [planificacionSemestreId], async tx => {
      for (const fila of filas) {
        const existente = await tx.query.ofertasAsignaturas.findFirst({ where: and(eq(ofertasAsignaturas.planificacionSemestreId, planificacionSemestreId), eq(ofertasAsignaturas.asignaturaCodigo, fila.asignaturaCodigo), eq(ofertasAsignaturas.seccion, fila.seccion)) });
        if (existente) throw new ConflictError("La oferta ya existe; no se importó ninguna fila.");
        const { sesiones, profesorId, ...oferta } = fila;
        const [creada] = await tx.insert(ofertasAsignaturas).values({ ...oferta, planificacionSemestreId }).returning();
        for (const tipoHoraId of new Set(sesiones.map(s => s.tipoHoraId))) await tx.insert(ofertaTipoHora).values({ ofertaId: creada.id, tipoHoraId, profesorId });
        for (const sesion of sesiones) await tx.insert(horariosAsignaturas).values({ ...sesion, ofertaId: creada.id, planificacionSemestreId, salaId: null });
      }
    });
  },
  async sincronizarExternosEnTransaccion(planificacionSemestreId: number, departamentoId: number, filas: { asignaturaCodigo: string; profesorId: number; seccion: number; cupos: number; sesiones: { bloqueId: number; tipoHoraId: number }[] }[], carreraId?: number) {
    return conPlanificacionesEditables(async () => [planificacionSemestreId], async tx => {
      const planificacion = await tx.query.planificacionesSemestres.findFirst({ where: eq(planificacionesSemestres.id, planificacionSemestreId) });
      if (!planificacion || (carreraId !== undefined && planificacion.carreraId !== carreraId)) throw new ConflictError("La planificación cambió de carrera; no se modificó la carga anterior.");
      const relacion = await tx.query.carreraDepartamento.findFirst({ where: and(eq(carreraDepartamento.carreraId, planificacion.carreraId), eq(carreraDepartamento.departamentoId, departamentoId), eq(carreraDepartamento.esGestionado, false)) });
      if (!relacion) throw new ConflictError("El departamento ya no es externo para esta carrera; no se modificó la carga anterior.");
      const malla = await tx.query.carreraAsignatura.findMany({ where: eq(carreraAsignatura.carreraId, planificacion.carreraId) });
      const codigosMalla = new Set(malla.map(vinculo => vinculo.asignaturaCodigo));
      const asignaturasDepartamento = await tx.query.asignaturas.findMany({ where: eq(asignaturas.departamentoId, departamentoId) });
      const codigos = new Set(asignaturasDepartamento.filter(asignatura => codigosMalla.has(asignatura.codigo)).map(asignatura => asignatura.codigo));
      const cubiertas = new Set(filas.filter(fila => fila.sesiones.length > 0).map(fila => fila.asignaturaCodigo));
      if (asignaturasDepartamento.some(asignatura => codigos.has(asignatura.codigo)
        && esObligatoriaExterna(asignatura.semestreMalla, planificacion.codigo) && !cubiertas.has(asignatura.codigo))) {
        throw new ConflictError("Faltan horarios obligatorios para el período seleccionado; no se modificó la carga anterior.");
      }
      if (!filas.length || filas.some(fila => !codigos.has(fila.asignaturaCodigo))) throw new ConflictError("La carga no coincide con las asignaturas autorizadas; no se modificó la carga anterior.");
      const profesoresDepartamento = await tx.query.profesores.findMany({ where: eq(profesores.departamentoId, departamentoId) });
      const profesoresValidos = new Set(profesoresDepartamento.map(profesor => profesor.id));
      const ofertas = await tx.query.ofertasAsignaturas.findMany({ where: eq(ofertasAsignaturas.planificacionSemestreId, planificacionSemestreId) });
      const reemplazadas = ofertas.filter(oferta => codigos.has(oferta.asignaturaCodigo));
      const idsReemplazados = new Set(reemplazadas.map(oferta => oferta.id));
      const asignaciones = await tx.query.ofertaTipoHora.findMany({ where: inArray(ofertaTipoHora.ofertaId, ofertas.map(oferta => oferta.id)) });
      const profesoresPorOfertaTipo = new Map(asignaciones.map(a => [`${a.ofertaId}:${a.tipoHoraId}`, a.profesorId]));
      const horarios = await tx.query.horariosAsignaturas.findMany({ where: eq(horariosAsignaturas.planificacionSemestreId, planificacionSemestreId) });
      const ocupaciones = new Set(horarios.filter(horario => !idsReemplazados.has(horario.ofertaId)).map(horario => `${profesoresPorOfertaTipo.get(`${horario.ofertaId}:${horario.tipoHoraId}`)}:${horario.bloqueId}`));
      const claves = new Set<string>();
      for (const fila of filas) {
        const clave = JSON.stringify([fila.asignaturaCodigo, fila.seccion]);
        if (claves.has(clave) || !profesoresValidos.has(fila.profesorId)) throw new ConflictError(`Revise la sección o el profesor de ${fila.asignaturaCodigo}; no se modificó la carga anterior.`);
        claves.add(clave);
        for (const sesion of fila.sesiones) {
          const ocupacion = `${fila.profesorId}:${sesion.bloqueId}`;
          if (ocupaciones.has(ocupacion)) throw new ConflictError(`El profesor de ${fila.asignaturaCodigo}, sección ${fila.seccion}, está ocupado en el bloque ${sesion.bloqueId}; no se modificó la carga anterior.`);
          ocupaciones.add(ocupacion);
        }
      }
      let ofertasCreadas = 0; let ofertasActualizadas = 0; let ofertasEliminadas = 0;
      for (const oferta of reemplazadas) {
        await tx.delete(horariosAsignaturas).where(and(eq(horariosAsignaturas.ofertaId, oferta.id), eq(horariosAsignaturas.planificacionSemestreId, planificacionSemestreId)));
        await tx.delete(ofertaTipoHora).where(eq(ofertaTipoHora.ofertaId, oferta.id));
        if (!claves.has(JSON.stringify([oferta.asignaturaCodigo, oferta.seccion]))) {
          await tx.delete(ofertasAsignaturas).where(and(eq(ofertasAsignaturas.id, oferta.id), eq(ofertasAsignaturas.planificacionSemestreId, planificacionSemestreId)));
          ofertasEliminadas++;
        }
      }
      for (const fila of filas) {
        const existente = reemplazadas.find(oferta => oferta.asignaturaCodigo === fila.asignaturaCodigo && oferta.seccion === fila.seccion);
        let ofertaId: number;
        if (existente) {
          await tx.update(ofertasAsignaturas).set({ cupos: fila.cupos }).where(eq(ofertasAsignaturas.id, existente.id));
          ofertaId = existente.id; ofertasActualizadas++;
        } else {
          const { sesiones: _, profesorId: __, ...oferta } = fila;
          const [creada] = await tx.insert(ofertasAsignaturas).values({ ...oferta, planificacionSemestreId }).returning();
          ofertaId = creada.id; ofertasCreadas++;
        }
        for (const tipoHoraId of new Set(fila.sesiones.map(s => s.tipoHoraId))) await tx.insert(ofertaTipoHora).values({ ofertaId, tipoHoraId, profesorId: fila.profesorId });
        for (const sesion of fila.sesiones) await tx.insert(horariosAsignaturas).values({ ...sesion, ofertaId, planificacionSemestreId, salaId: null });
      }
      return { ofertasCreadas, ofertasActualizadas, ofertasEliminadas };
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
    await conPlanificacionesEditables(async tx => {
      const vinculos = [planificacionSemestreId];
      for (const cambio of cambios) vinculos.push((await leerHorario(tx, cambio.id)).planificacionSemestreId);
      return vinculos;
    }, async tx => {
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
      with: { ...relacionesExcel, oferta: { with: { asignatura: { with: { tiposHora: { with: { tipoHora: true } } } } } }, sala: true },
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
        filtro?.profesorId ? inArray(horariosAsignaturas.id, db.select({ id: horariosAsignaturas.id }).from(horariosAsignaturas)
          .innerJoin(ofertaTipoHora, and(eq(ofertaTipoHora.ofertaId, horariosAsignaturas.ofertaId), eq(ofertaTipoHora.tipoHoraId, horariosAsignaturas.tipoHoraId)))
          .where(eq(ofertaTipoHora.profesorId, filtro.profesorId))) : undefined,
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
      .innerJoin(ofertaTipoHora, and(eq(horariosAsignaturas.ofertaId, ofertaTipoHora.ofertaId), eq(horariosAsignaturas.tipoHoraId, ofertaTipoHora.tipoHoraId)))
      .where(and(eq(ofertaTipoHora.profesorId, profesorId), eq(horariosAsignaturas.bloqueId, bloqueId), eq(horariosAsignaturas.planificacionSemestreId, planificacionSemestreId))).limit(1);
    return resultado;
  },
  async findOfertaWithDetails(ofertaId: number) {
    return db.query.ofertasAsignaturas.findFirst({ where: eq(ofertasAsignaturas.id, ofertaId), with: { asignatura: true, asignaciones: { with: { profesor: { columns: columnasProfesorSinRut } } }, planificacionSemestre: true } });
  },
  async checkSalaExists(id: number) { return !!await db.query.salas.findFirst({ where: eq(salas.id, id) }); },
  async checkBloqueExists(id: number) { return !!await db.query.bloquesHorarios.findFirst({ where: eq(bloquesHorarios.id, id) }); },
  async checkTipoHoraExists(id: number) { return !!await db.query.tiposHora.findFirst({ where: eq(tiposHora.id, id) }); },
  async checkPlanificacionExists(id: number) { return !!await planificacionesSemestresRepository.findById(id); },
  async create(datos: NuevoHorarioAsignatura) {
    let ofertaPlanificacionId: number;
    return conPlanificacionesEditables(async tx => {
      ofertaPlanificacionId = (await leerOferta(tx, datos.ofertaId)).planificacionSemestreId;
      return [datos.planificacionSemestreId, ofertaPlanificacionId];
    }, async tx => {
      exigirMismaPlanificacion(datos.planificacionSemestreId, ofertaPlanificacionId);
      await exigirHorarioValido(tx, datos);
      const [creada] = await tx.insert(horariosAsignaturas).values(datos).returning();
      return creada;
    });
  },
  async update(id: number, datos: Partial<Omit<NuevoHorarioAsignatura, "id">>, origenEsperado?: number) {
    let destino: number;
    let ofertaPlanificacionId: number;
    return conPlanificacionesEditables(async tx => {
      const origen = await leerHorario(tx, id);
      exigirVinculoEsperado(origen.planificacionSemestreId, origenEsperado);
      destino = datos.planificacionSemestreId ?? origen.planificacionSemestreId;
      ofertaPlanificacionId = (await leerOferta(tx, datos.ofertaId ?? origen.ofertaId)).planificacionSemestreId;
      return [origen.planificacionSemestreId, destino, ofertaPlanificacionId];
    }, async tx => {
      exigirMismaPlanificacion(destino, ofertaPlanificacionId);
      const origen = await leerHorario(tx, id);
      await exigirHorarioValido(tx, { ...origen, ...datos }, id);
      const [actualizada] = await tx.update(horariosAsignaturas).set(datos).where(eq(horariosAsignaturas.id, id)).returning();
      return actualizada;
    });
  },
  async delete(id: number, origenEsperado?: number) {
    return conPlanificacionesEditables(async tx => {
      const origen = (await leerHorario(tx, id)).planificacionSemestreId;
      exigirVinculoEsperado(origen, origenEsperado);
      return [origen];
    }, async tx =>
      !!(await tx.delete(horariosAsignaturas).where(eq(horariosAsignaturas.id, id)).returning()).length);
  },
  async deleteByOferta(ofertaId: number, origenEsperado?: number) {
    return conPlanificacionesEditables(async tx => {
      const origen = (await leerOferta(tx, ofertaId)).planificacionSemestreId;
      exigirVinculoEsperado(origen, origenEsperado);
      return [origen];
    }, async tx =>
      (await tx.delete(horariosAsignaturas).where(eq(horariosAsignaturas.ofertaId, ofertaId)).returning()).length);
  },
  async findProfesorByUsuarioId(usuarioId: number) {
    return db.query.profesores.findFirst({ where: eq(profesores.usuarioId, usuarioId) });
  },
};
