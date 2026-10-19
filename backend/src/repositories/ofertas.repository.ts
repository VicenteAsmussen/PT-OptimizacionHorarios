import type { AlcanceCarrera } from "../utils/alcance-carrera.js";
import { eq, and, inArray } from "drizzle-orm";
import { db } from "../config/db.js";
import {
  ofertasAsignaturas,
  type OfertaAsignatura,
  type NuevaOfertaAsignatura,
} from "../db/schema/ofertas-asignaturas.schema.js";
import { asignaturas } from "../db/schema/asignaturas.schema.js";
import { profesores, columnasProfesorSinRut } from "../db/schema/profesores.schema.js";
import { semestres } from "../db/schema/semestres.schema.js";
import { horariosAsignaturas } from "../db/schema/horarios-asignaturas.schema.js";
import { ConflictError } from "../utils/errors.js";

export const ofertasRepository = {
  async findAll(filter?: { semestreId?: number; profesorId?: number; asignaturaCodigo?: string }, alcance?: AlcanceCarrera) {
    const conditions = [];
    if (alcance) conditions.push(inArray(ofertasAsignaturas.asignaturaCodigo, alcance.asignaturasCodigos));
    if (filter?.semestreId) {
      conditions.push(eq(ofertasAsignaturas.semestreId, filter.semestreId));
    }
    if (filter?.profesorId) {
      conditions.push(eq(ofertasAsignaturas.profesorId, filter.profesorId));
    }
    if (filter?.asignaturaCodigo) {
      conditions.push(eq(ofertasAsignaturas.asignaturaCodigo, filter.asignaturaCodigo));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    return await db.query.ofertasAsignaturas.findMany({
      where: whereClause,
      with: {
        asignatura: {
          with: {
            tiposHora: {
              with: {
                tipoHora: true,
              },
            },
          },
        },
        profesor: {
          columns: columnasProfesorSinRut,
          with: {
            departamento: true,
          },
        },
        semestre: true,
        horarios: {
          with: {
            sala: true,
            bloque: true,
            tipoHora: true,
          },
        },
      },
    });
  },

  async findById(id: number) {
    return await db.query.ofertasAsignaturas.findFirst({
      where: eq(ofertasAsignaturas.id, id),
      with: {
        asignatura: {
          with: {
            tiposHora: {
              with: {
                tipoHora: true,
              },
            },
          },
        },
        profesor: {
          columns: columnasProfesorSinRut,
          with: {
            departamento: true,
          },
        },
        semestre: true,
        horarios: {
          with: {
            sala: true,
            bloque: true,
            tipoHora: true,
          },
        },
      },
    });
  },

  async findByUniqueConstraint(asignaturaCodigo: string, semestreId: number, seccion: number) {
    return await db.query.ofertasAsignaturas.findFirst({
      where: and(
        eq(ofertasAsignaturas.asignaturaCodigo, asignaturaCodigo),
        eq(ofertasAsignaturas.semestreId, semestreId),
        eq(ofertasAsignaturas.seccion, seccion)
      ),
    });
  },

  async checkAsignaturaExists(codigo: string): Promise<boolean> {
    const [asig] = await db
      .select({ codigo: asignaturas.codigo })
      .from(asignaturas)
      .where(eq(asignaturas.codigo, codigo))
      .limit(1);
    return !!asig;
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

  async create(data: NuevaOfertaAsignatura): Promise<OfertaAsignatura> {
    const [created] = await db.insert(ofertasAsignaturas).values(data).returning();
    return created;
  },

  async update(
    id: number,
    data: Partial<Omit<NuevaOfertaAsignatura, "id">>
  ): Promise<OfertaAsignatura | undefined> {
    const [updated] = await db
      .update(ofertasAsignaturas)
      .set(data)
      .where(eq(ofertasAsignaturas.id, id))
      .returning();
    return updated;
  },

  async delete(id: number): Promise<boolean> {
    return await db.transaction(async (tx) => {
      // FOR UPDATE bloquea el KEY SHARE de la FK de nuevos horarios. Si un horario
      // ya se estaba insertando, esperamos su commit antes de consultar dependencias.
      const [oferta] = await tx
        .select({ id: ofertasAsignaturas.id })
        .from(ofertasAsignaturas)
        .where(eq(ofertasAsignaturas.id, id))
        .for("update");
      if (!oferta) return false;

      const [horario] = await tx
        .select({ id: horariosAsignaturas.id })
        .from(horariosAsignaturas)
        .where(eq(horariosAsignaturas.ofertaId, id))
        .limit(1);
      if (horario) {
        throw new ConflictError("No se puede eliminar una oferta con horarios asociados");
      }

      const [eliminada] = await tx
        .delete(ofertasAsignaturas)
        .where(eq(ofertasAsignaturas.id, id))
        .returning({ id: ofertasAsignaturas.id });
      return !!eliminada;
    }, { isolationLevel: "read committed" });
  },
};
