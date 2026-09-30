import { eq, and, inArray } from "drizzle-orm";
import { db } from "../config/db.js";
import {
  horariosAsignaturas,
  type HorarioAsignatura,
  type NuevoHorarioAsignatura,
} from "../db/schema/horarios.schema.js";
import { ofertasAsignaturas } from "../db/schema/planificacion.schema.js";
import { asignaturas } from "../db/schema/asignaturas.schema.js";
import { profesores } from "../db/schema/profesores.schema.js";
import { salas, bloquesHorarios, tiposHora, semestres } from "../db/schema/recursos.schema.js";

export const horariosRepository = {
  async findAll(filter?: {
    semestreId?: number;
    ofertaId?: number;
    salaId?: number;
    bloqueId?: number;
    semestreMalla?: number;
    profesorId?: number;
  }) {
    const conditions = [];
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
      where: whereClause,
      with: {
        oferta: {
          with: {
            asignatura: true,
            profesor: {
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
      where: eq(horariosAsignaturas.id, id),
      with: {
        oferta: {
          with: {
            asignatura: true,
            profesor: {
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
        profesor: true,
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

  async create(data: NuevoHorarioAsignatura): Promise<HorarioAsignatura> {
    const [created] = await db.insert(horariosAsignaturas).values(data).returning();
    return created;
  },

  async update(
    id: number,
    data: Partial<Omit<NuevoHorarioAsignatura, "id">>
  ): Promise<HorarioAsignatura | undefined> {
    const [updated] = await db
      .update(horariosAsignaturas)
      .set(data)
      .where(eq(horariosAsignaturas.id, id))
      .returning();
    return updated;
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
