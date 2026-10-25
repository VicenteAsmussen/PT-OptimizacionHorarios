import { asc, eq, inArray } from "drizzle-orm";
import { db } from "../config/db.js";
import { profesores } from "../db/schema/profesores.schema.js";
import { disponibilidadProfesores } from "../db/schema/disponibilidad-profesores.schema.js";
import { ofertaTipoHora } from "../db/schema/oferta-tipo-hora.schema.js";
import { ofertasAsignaturas } from "../db/schema/ofertas-asignaturas.schema.js";

export const seguimientoDisponibilidadRepository = {
  async profesores(planificacionSemestreId: number, departamentosIds: number[]) {
    if (!departamentosIds.length) return [];
    return db.query.profesores.findMany({
      columns: { id: true, nombre: true, departamentoId: true },
      where: inArray(profesores.departamentoId, departamentosIds),
      orderBy: [asc(profesores.nombre), asc(profesores.id)],
      with: {
        departamento: { columns: { id: true, nombre: true } },
        asignaciones: {
          where: inArray(ofertaTipoHora.ofertaId, db.select({ id: ofertasAsignaturas.id }).from(ofertasAsignaturas)
            .where(eq(ofertasAsignaturas.planificacionSemestreId, planificacionSemestreId))),
          with: { oferta: { with: { asignatura: { with: { tiposHora: true } } } } },
        },
        disponibilidades: {
          columns: { profesorId: true, planificacionSemestreId: true, bloqueId: true },
          where: eq(disponibilidadProfesores.planificacionSemestreId, planificacionSemestreId),
        },
      },
    });
  },
};
