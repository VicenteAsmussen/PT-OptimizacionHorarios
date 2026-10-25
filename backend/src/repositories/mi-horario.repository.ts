import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { db } from "../config/db.js";
import { bloquesHorarios } from "../db/schema/bloques-horarios.schema.js";
import { ofertaTipoHora } from "../db/schema/oferta-tipo-hora.schema.js";
import { ofertasAsignaturas } from "../db/schema/ofertas-asignaturas.schema.js";
import { planificacionesSemestres } from "../db/schema/planificaciones-semestres.schema.js";

export const miHorarioRepository = {
  async findPlanificaciones(profesorId: number) {
    const filas = await db.query.planificacionesSemestres.findMany({
      where: and(
        inArray(planificacionesSemestres.estadoPlanificacion, ["propuesta", "publicado"]),
        inArray(planificacionesSemestres.id, db.select({ id: ofertasAsignaturas.planificacionSemestreId })
          .from(ofertasAsignaturas)
          .innerJoin(ofertaTipoHora, eq(ofertaTipoHora.ofertaId, ofertasAsignaturas.id))
          .where(eq(ofertaTipoHora.profesorId, profesorId))),
      ),
      with: { carrera: true },
      orderBy: [desc(planificacionesSemestres.actual), desc(planificacionesSemestres.codigo), asc(planificacionesSemestres.id)],
    });
    return filas.map(fila => ({
      id: fila.id, codigo: fila.codigo, carreraNombre: fila.carrera.nombre,
      estadoPlanificacion: fila.estadoPlanificacion, actual: fila.actual,
    }));
  },
  async findBloques() {
    return db.query.bloquesHorarios.findMany({ orderBy: [asc(bloquesHorarios.numeroBloque), asc(bloquesHorarios.id)] });
  },
};
