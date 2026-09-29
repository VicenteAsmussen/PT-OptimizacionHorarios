import { eq, and, inArray } from "drizzle-orm";
import { db } from "../config/db.js";
import {
  disponibilidadProfesores,
  type DisponibilidadProfesor,
  type NuevaDisponibilidadProfesor,
} from "../db/schema/planificacion.schema.js";
import { profesores } from "../db/schema/profesores.schema.js";
import { semestres, bloquesHorarios } from "../db/schema/recursos.schema.js";
import { horariosAsignaturas } from "../db/schema/horarios.schema.js";

export const disponibilidadRepository = {
  async findAll(filter?: { profesorId?: number; semestreId?: number }) {
    const conditions = [];
    if (filter?.profesorId) {
      conditions.push(eq(disponibilidadProfesores.profesorId, filter.profesorId));
    }
    if (filter?.semestreId) {
      conditions.push(eq(disponibilidadProfesores.semestreId, filter.semestreId));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    return await db.query.disponibilidadProfesores.findMany({
      where: whereClause,
      with: {
        profesor: true,
        semestre: true,
        bloque: true,
      },
    });
  },

  async findById(id: number) {
    return await db.query.disponibilidadProfesores.findFirst({
      where: eq(disponibilidadProfesores.id, id),
      with: {
        profesor: true,
        semestre: true,
        bloque: true,
      },
    });
  },

  async findSpecific(profesorId: number, semestreId: number, bloqueId: number) {
    return await db.query.disponibilidadProfesores.findFirst({
      where: and(
        eq(disponibilidadProfesores.profesorId, profesorId),
        eq(disponibilidadProfesores.semestreId, semestreId),
        eq(disponibilidadProfesores.bloqueId, bloqueId)
      ),
      with: {
        profesor: true,
        semestre: true,
        bloque: true,
      },
    });
  },

  async checkProfesorExists(profesorId: number): Promise<boolean> {
    const [prof] = await db
      .select({ id: profesores.id })
      .from(profesores)
      .where(eq(profesores.id, profesorId))
      .limit(1);
    return !!prof;
  },

  async checkSemestreExists(semestreId: number): Promise<boolean> {
    const [sem] = await db
      .select({ id: semestres.id })
      .from(semestres)
      .where(eq(semestres.id, semestreId))
      .limit(1);
    return !!sem;
  },

  async checkHorariosExistForSemestre(semestreId: number): Promise<boolean> {
    const [horario] = await db
      .select({ id: horariosAsignaturas.id })
      .from(horariosAsignaturas)
      .where(eq(horariosAsignaturas.semestreId, semestreId))
      .limit(1);
    return !!horario;
  },

  async checkBloqueExists(bloqueId: number): Promise<boolean> {
    const [bloque] = await db
      .select({ id: bloquesHorarios.id })
      .from(bloquesHorarios)
      .where(eq(bloquesHorarios.id, bloqueId))
      .limit(1);
    return !!bloque;
  },

  async findExistingBloquesIds(ids: number[]): Promise<number[]> {
    if (ids.length === 0) return [];
    const results = await db
      .select({ id: bloquesHorarios.id })
      .from(bloquesHorarios)
      .where(inArray(bloquesHorarios.id, ids));
    return results.map((r) => r.id);
  },

  async create(data: NuevaDisponibilidadProfesor): Promise<DisponibilidadProfesor> {
    const [created] = await db
      .insert(disponibilidadProfesores)
      .values(data)
      .returning();
    return created;
  },

  async syncDisponibilidad(
    profesorId: number,
    semestreId: number,
    bloquesIds: number[]
  ) {
    return await db.transaction(async (tx) => {
      // 1. Clear previous slots for this professor & semester
      await tx
        .delete(disponibilidadProfesores)
        .where(
          and(
            eq(disponibilidadProfesores.profesorId, profesorId),
            eq(disponibilidadProfesores.semestreId, semestreId)
          )
        );

      // 2. Insert new selected slots
      if (bloquesIds.length > 0) {
        await tx.insert(disponibilidadProfesores).values(
          bloquesIds.map((bloqueId) => ({
            profesorId,
            semestreId,
            bloqueId,
          }))
        );
      }

      // 3. Return updated full list
      return await tx.query.disponibilidadProfesores.findMany({
        where: and(
          eq(disponibilidadProfesores.profesorId, profesorId),
          eq(disponibilidadProfesores.semestreId, semestreId)
        ),
        with: {
          profesor: true,
          semestre: true,
          bloque: true,
        },
      });
    });
  },

  async delete(id: number): Promise<boolean> {
    const [deleted] = await db
      .delete(disponibilidadProfesores)
      .where(eq(disponibilidadProfesores.id, id))
      .returning();
    return !!deleted;
  },

  async deleteByProfesorAndSemestre(profesorId: number, semestreId: number): Promise<number> {
    const deleted = await db
      .delete(disponibilidadProfesores)
      .where(
        and(
          eq(disponibilidadProfesores.profesorId, profesorId),
          eq(disponibilidadProfesores.semestreId, semestreId)
        )
      )
      .returning();
    return deleted.length;
  },
};
