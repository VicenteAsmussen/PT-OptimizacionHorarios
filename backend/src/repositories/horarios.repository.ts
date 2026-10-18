import type { AlcanceCarrera } from "../utils/alcance-carrera.js";
import { eq, and, inArray, sql } from "drizzle-orm";
import { db } from "../config/db.js";
import {
  horariosAsignaturas,
  type HorarioAsignatura,
  type NuevoHorarioAsignatura,
} from "../db/schema/horarios-asignaturas.schema.js";
import { departamentos } from "../db/schema/departamentos.schema.js";
import { ConflictError } from "../utils/errors.js";
import { ofertasAsignaturas } from "../db/schema/ofertas-asignaturas.schema.js";
import { asignaturas } from "../db/schema/asignaturas.schema.js";
import { profesores, columnasProfesorSinRut } from "../db/schema/profesores.schema.js";
import { salas } from "../db/schema/salas.schema.js";
import { bloquesHorarios } from "../db/schema/bloques-horarios.schema.js";
import { tiposHora } from "../db/schema/tipos-hora.schema.js";
import { semestres } from "../db/schema/semestres.schema.js";
import { semestresHorarios } from "../db/schema/semestres-horarios.schema.js";
import { secretarias } from "../db/schema/secretarias.schema.js";
import { carreraAsignatura } from "../db/schema/carrera-asignatura.schema.js";
import { carreraDepartamento } from "../db/schema/carrera-departamento.schema.js";

// Ambas condiciones deben cumplirse para la misma carrera, sin multiplicar filas.
function condicionAlcanceExcel(carreraId?: number) {
  if (carreraId === undefined) return undefined;
  return inArray(horariosAsignaturas.ofertaId, db.select({ id: ofertasAsignaturas.id })
    .from(ofertasAsignaturas)
    .innerJoin(asignaturas, eq(asignaturas.codigo, ofertasAsignaturas.asignaturaCodigo))
    .innerJoin(carreraAsignatura, eq(carreraAsignatura.asignaturaCodigo, ofertasAsignaturas.asignaturaCodigo))
    .innerJoin(carreraDepartamento, eq(carreraDepartamento.departamentoId, asignaturas.departamentoId))
    .where(and(eq(carreraAsignatura.carreraId, carreraId), eq(carreraDepartamento.carreraId, carreraId),
      eq(carreraDepartamento.esGestionado, true))));
}

// Publication belongs to the entry, not to either nested semester response.
const publicationProjection = (table: { id: typeof horariosAsignaturas.id }) => ({
  horarioPublicado: sql<boolean>`coalesce((select sh.horario_publicado from semestres_horarios sh where sh.horario_asignatura_id = ${table.id}), false)`.as("horario_publicado"),
});
type Entrada = HorarioAsignatura & { horarioPublicado: boolean };
type NuevaEntrada = NuevoHorarioAsignatura & { horarioPublicado?: boolean };

export const horariosRepository = {
  async findContextoExternos(semestreId: number, departamentoId: number, carreraId?: number) {
    const departamento = await db.query.departamentos.findFirst({ where: eq(departamentos.id, departamentoId) });
    const relacion = carreraId === undefined ? undefined : await db.query.carreraDepartamento.findFirst({
      where: and(eq(carreraDepartamento.carreraId, carreraId), eq(carreraDepartamento.departamentoId, departamentoId), eq(carreraDepartamento.esGestionado, false)),
    });
    return {
      departamentoValido: !!departamento && (carreraId === undefined || !!relacion),
      asignaturas: await db.select().from(asignaturas).where(and(
        eq(asignaturas.departamentoId, departamentoId),
        carreraId === undefined ? undefined : inArray(asignaturas.codigo,
          db.select({ codigo: carreraAsignatura.asignaturaCodigo }).from(carreraAsignatura).where(eq(carreraAsignatura.carreraId, carreraId))),
      )),
      profesores: await db.select().from(profesores).where(eq(profesores.departamentoId, departamentoId)),
      tipos: await db.select().from(tiposHora),
      bloques: await db.select().from(bloquesHorarios),
      ofertas: await db.select().from(ofertasAsignaturas).where(eq(ofertasAsignaturas.semestreId, semestreId)),
      ocupaciones: await db.select({ profesorId: ofertasAsignaturas.profesorId, bloqueId: horariosAsignaturas.bloqueId }).from(horariosAsignaturas)
        .innerJoin(ofertasAsignaturas, eq(ofertasAsignaturas.id, horariosAsignaturas.ofertaId)).where(eq(horariosAsignaturas.semestreId, semestreId)),
    };
  },

  async crearExternosEnTransaccion(semestreId: number, filas: { asignaturaCodigo: string; profesorId: number; seccion: number; cupos: number; sesiones: { bloqueId: number; tipoHoraId: number }[] }[]) {
    await db.transaction(async (tx) => {
      // No hay restricción UNIQUE para la clave de oferta en el esquema actual.
      // El bloqueo de tabla serializa también inserciones desde otros endpoints.
      await tx.execute(sql`LOCK TABLE ofertas_asignaturas IN SHARE ROW EXCLUSIVE MODE`);
      for (const fila of filas) {
        const existente = await tx.query.ofertasAsignaturas.findFirst({ where: and(eq(ofertasAsignaturas.semestreId, semestreId), eq(ofertasAsignaturas.asignaturaCodigo, fila.asignaturaCodigo), eq(ofertasAsignaturas.seccion, fila.seccion)) });
        if (existente) throw new ConflictError("La oferta ya existe; no se importó ninguna fila.");
        const { sesiones, ...oferta } = fila;
        const [creada] = await tx.insert(ofertasAsignaturas).values({ ...oferta, semestreId }).returning();
        for (const sesion of sesiones) {
          const [horario] = await tx.insert(horariosAsignaturas).values({ ...sesion, ofertaId: creada.id, semestreId, salaId: null }).returning();
          await tx.insert(semestresHorarios).values({ semestreId, horarioAsignaturaId: horario.id, horarioPublicado: false });
        }
      }
    });
  },

  async findCarreraSecretariaByUsuarioId(usuarioId: number) {
    const [perfil] = await db.select({ carreraId: secretarias.carreraId }).from(secretarias)
      .where(eq(secretarias.usuarioId, usuarioId)).limit(1);
    return perfil;
  },

  async findParaImportarSalas(semestreId: number, carreraId?: number) {
    const entradas = await db.query.horariosAsignaturas.findMany({
      where: and(eq(horariosAsignaturas.semestreId, semestreId), condicionAlcanceExcel(carreraId)),
      with: { oferta: { with: { asignatura: true, profesor: { columns: columnasProfesorSinRut } } }, bloque: true, tipoHora: true },
    });
    const salasExistentes = await db.select({ id: salas.id, nombre: salas.nombre }).from(salas);
    // La ocupación de salas sigue siendo global; estas filas no se usan para identificar sesiones editables.
    const entradasParaConflictos = carreraId === undefined ? entradas : await db.query.horariosAsignaturas.findMany({
      where: eq(horariosAsignaturas.semestreId, semestreId),
      with: { oferta: { with: { asignatura: true, profesor: { columns: columnasProfesorSinRut } } }, bloque: true, tipoHora: true },
    });
    return { entradas, entradasParaConflictos, salas: salasExistentes };
  },

  async actualizarSalasEnTransaccion(semestreId: number, cambios: { id: number; salaId: number | null }[], carreraId?: number) {
    await db.transaction(async (tx) => {
      for (const cambio of cambios) {
        const actualizadas = await tx.update(horariosAsignaturas).set({ salaId: cambio.salaId })
          .where(and(eq(horariosAsignaturas.id, cambio.id), eq(horariosAsignaturas.semestreId, semestreId), condicionAlcanceExcel(carreraId))).returning({ id: horariosAsignaturas.id });
        if (actualizadas.length !== 1) throw new Error("El horario cambió durante la importación; vuelva a exportar e importar.");
      }
    });
  },

  async findSemestreById(semestreId: number) {
    const [semestre] = await db
      .select({ codigo: semestres.codigo })
      .from(semestres)
      .where(eq(semestres.id, semestreId))
      .limit(1);
    return semestre;
  },

  async findParaExportarSalas(semestreId: number, carreraId?: number) {
    return await db.query.horariosAsignaturas.findMany({
      where: and(eq(horariosAsignaturas.semestreId, semestreId), condicionAlcanceExcel(carreraId)),
      with: {
        oferta: {
          with: {
            asignatura: { with: { tiposHora: { with: { tipoHora: true } } } },
            profesor: { columns: columnasProfesorSinRut },
          },
        },
        bloque: true,
        tipoHora: true,
        sala: true,
      },
    });
  },

  async findAll(filter?: {
    semestreId?: number;
    ofertaId?: number;
    salaId?: number;
    bloqueId?: number;
    semestreMalla?: number;
    profesorId?: number;
  }, alcance?: AlcanceCarrera) {
    const conditions = [];
    if (alcance) conditions.push(inArray(horariosAsignaturas.ofertaId, alcance.ofertasIds));
    if (filter?.semestreId) {
      conditions.push(eq(horariosAsignaturas.semestreId, filter.semestreId));
    }
    if (filter?.ofertaId) {
      conditions.push(eq(horariosAsignaturas.ofertaId, filter.ofertaId));
    }
    if (filter?.salaId) {
      conditions.push(eq(horariosAsignaturas.salaId, filter.salaId));
    }
    if (filter?.bloqueId) {
      conditions.push(eq(horariosAsignaturas.bloqueId, filter.bloqueId));
    }
    if (filter?.semestreMalla) {
      conditions.push(
        inArray(
          horariosAsignaturas.ofertaId,
          db
            .select({ id: ofertasAsignaturas.id })
            .from(ofertasAsignaturas)
            .innerJoin(
              asignaturas,
              eq(ofertasAsignaturas.asignaturaCodigo, asignaturas.codigo)
            )
            .where(eq(asignaturas.semestreMalla, filter.semestreMalla))
        )
      );
    }
    if (filter?.profesorId) {
      conditions.push(
        inArray(
          horariosAsignaturas.ofertaId,
          db
            .select({ id: ofertasAsignaturas.id })
            .from(ofertasAsignaturas)
            .where(eq(ofertasAsignaturas.profesorId, filter.profesorId))
        )
      );
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    return await db.query.horariosAsignaturas.findMany({
      extras: publicationProjection,
      where: whereClause,
      with: {
        oferta: {
          with: {
            asignatura: true,
            profesor: {
              columns: columnasProfesorSinRut,
              with: {
                departamento: true,
              },
            },
            semestre: true,
          },
        },
        sala: true,
        bloque: true,
        tipoHora: true,
        semestre: true,
      },
    });
  },

  async findById(id: number) {
    return await db.query.horariosAsignaturas.findFirst({
      extras: publicationProjection,
      where: eq(horariosAsignaturas.id, id),
      with: {
        oferta: {
          with: {
            asignatura: true,
            profesor: {
              columns: columnasProfesorSinRut,
              with: {
                departamento: true,
              },
            },
            semestre: true,
          },
        },
        sala: true,
        bloque: true,
        tipoHora: true,
        semestre: true,
      },
    });
  },

  async findBySalaBloqueSemestre(salaId: number, bloqueId: number, semestreId: number) {
    return await db.query.horariosAsignaturas.findFirst({
      where: and(
        eq(horariosAsignaturas.salaId, salaId),
        eq(horariosAsignaturas.bloqueId, bloqueId),
        eq(horariosAsignaturas.semestreId, semestreId)
      ),
    });
  },

  async findByOfertaBloque(ofertaId: number, bloqueId: number) {
    return await db.query.horariosAsignaturas.findFirst({
      where: and(
        eq(horariosAsignaturas.ofertaId, ofertaId),
        eq(horariosAsignaturas.bloqueId, bloqueId)
      ),
    });
  },

  async findByProfesorBloqueSemestre(profesorId: number, bloqueId: number, semestreId: number) {
    const [result] = await db
      .select({
        id: horariosAsignaturas.id,
        ofertaId: horariosAsignaturas.ofertaId,
      })
      .from(horariosAsignaturas)
      .innerJoin(
        ofertasAsignaturas,
        eq(horariosAsignaturas.ofertaId, ofertasAsignaturas.id)
      )
      .where(
        and(
          eq(ofertasAsignaturas.profesorId, profesorId),
          eq(horariosAsignaturas.bloqueId, bloqueId),
          eq(horariosAsignaturas.semestreId, semestreId)
        )
      )
      .limit(1);
    return result;
  },

  async findOfertaWithDetails(ofertaId: number) {
    return await db.query.ofertasAsignaturas.findFirst({
      where: eq(ofertasAsignaturas.id, ofertaId),
      with: {
        asignatura: true,
        profesor: { columns: columnasProfesorSinRut },
        semestre: true,
      },
    });
  },

  async checkSalaExists(salaId: number): Promise<boolean> {
    const [sala] = await db
      .select({ id: salas.id })
      .from(salas)
      .where(eq(salas.id, salaId))
      .limit(1);
    return !!sala;
  },

  async checkBloqueExists(bloqueId: number): Promise<boolean> {
    const [bloque] = await db
      .select({ id: bloquesHorarios.id })
      .from(bloquesHorarios)
      .where(eq(bloquesHorarios.id, bloqueId))
      .limit(1);
    return !!bloque;
  },

  async checkTipoHoraExists(tipoHoraId: number): Promise<boolean> {
    const [th] = await db
      .select({ id: tiposHora.id })
      .from(tiposHora)
      .where(eq(tiposHora.id, tipoHoraId))
      .limit(1);
    return !!th;
  },

  async checkSemestreExists(semestreId: number): Promise<boolean> {
    const [sem] = await db
      .select({ id: semestres.id })
      .from(semestres)
      .where(eq(semestres.id, semestreId))
      .limit(1);
    return !!sem;
  },

  async create(data: NuevaEntrada): Promise<Entrada> {
    return await db.transaction(async (tx) => {
      const { horarioPublicado = false, ...entryData } = data;
      const [created] = await tx.insert(horariosAsignaturas).values(entryData).returning();
      await tx.insert(semestresHorarios).values({
        semestreId: created.semestreId, horarioAsignaturaId: created.id, horarioPublicado,
      });
      return { ...created, horarioPublicado };
    });
  },

  async update(
    id: number,
    data: Partial<Omit<NuevaEntrada, "id">>
  ): Promise<Entrada | undefined> {
    return await db.transaction(async (tx) => {
      const { horarioPublicado, ...entryData } = data;
      // Entry updates acquire the owner lock; publication-only writes explicitly lock it.
      // ON UPDATE CASCADE moves the relation's semester before its publication is written.
      const [updated] = Object.keys(entryData).length
        ? await tx.update(horariosAsignaturas).set(entryData)
          .where(eq(horariosAsignaturas.id, id)).returning()
        : await tx.select().from(horariosAsignaturas)
          .where(eq(horariosAsignaturas.id, id)).for("update");
      if (!updated) return undefined;
      const [publication] = horarioPublicado !== undefined
        ? await tx.update(semestresHorarios).set({ horarioPublicado })
          .where(eq(semestresHorarios.horarioAsignaturaId, id)).returning()
        : await tx.select().from(semestresHorarios)
          .where(eq(semestresHorarios.horarioAsignaturaId, id));
      if (!publication) throw new Error("La entrada no tiene una relación de publicación");
      return { ...updated, horarioPublicado: publication.horarioPublicado };
    });
  },

  async delete(id: number): Promise<boolean> {
    const [deleted] = await db
      .delete(horariosAsignaturas)
      .where(eq(horariosAsignaturas.id, id))
      .returning();
    return !!deleted;
  },

  async deleteByOferta(ofertaId: number): Promise<number> {
    const deleted = await db
      .delete(horariosAsignaturas)
      .where(eq(horariosAsignaturas.ofertaId, ofertaId))
      .returning();
    return deleted.length;
  },

  async findProfesorByUsuarioId(usuarioId: number) {
    return await db.query.profesores.findFirst({
      where: eq(profesores.usuarioId, usuarioId),
    });
  },

  async findActualSemestre() {
    return await db.query.semestres.findFirst({
      where: eq(semestres.actual, true),
    });
  },
};
