import { and, eq, inArray } from "drizzle-orm";
import { db } from "../config/db.js";
import { carreras, carreraAsignatura, carreraDepartamento, horariosAsignaturas, planificacionesSemestres, ofertasAsignaturas,
  disponibilidadProfesores, salas, bloquesHorarios } from "../db/schema/index.js";
import { columnasProfesorSinRut } from "../db/schema/profesores.schema.js";
import type { ContextoResultado } from "../utils/resultados-horarios.js";
import { NotFoundError, ConflictError } from "../utils/errors.js";
import type { TransaccionPlanificacion } from "./planificacion-escritura.js";

const conAsignatura = { asignatura: { with: { tiposHora: { with: { tipoHora: true as const } } } } };
async function cargar(tx: TransaccionPlanificacion, id: number): Promise<ContextoResultado> {
  const planificacion = await tx.query.planificacionesSemestres.findFirst({ where: eq(planificacionesSemestres.id, id) });
  if (!planificacion) throw new NotFoundError("Planificación no encontrada.");
  const entradas = await tx.query.horariosAsignaturas.findMany({ where: eq(horariosAsignaturas.planificacionSemestreId, id), with: {
    oferta: { with: conAsignatura }, asignacion: { with: { profesor: { columns: columnasProfesorSinRut } } }, bloque: true, tipoHora: true, sala: true,
  } });
  const ofertas = await tx.query.ofertasAsignaturas.findMany({ where: eq(ofertasAsignaturas.planificacionSemestreId, id), with: conAsignatura });
  const malla = await tx.query.carreraAsignatura.findMany({ where: eq(carreraAsignatura.carreraId, planificacion.carreraId), with: conAsignatura });
  const departamentos = await tx.query.carreraDepartamento.findMany({ where: and(eq(carreraDepartamento.carreraId, planificacion.carreraId), eq(carreraDepartamento.esGestionado, true)) });
  return { planificacion, entradas, ofertas, asignaturasMalla: malla.map(vinculo => vinculo.asignatura),
    departamentosGestionadosIds: departamentos.map(departamento => departamento.departamentoId),
    bloques: await tx.select().from(bloquesHorarios), salas: await tx.select({ id: salas.id, nombre: salas.nombre }).from(salas),
    disponibilidades: await tx.query.disponibilidadProfesores.findMany({ where: eq(disponibilidadProfesores.planificacionSemestreId, id) }) };
}
export interface PersistenciaResultado {
  mover(cambios: { id: number; bloqueId: number }[]): Promise<void>;
  asignarSalas(cambios: { id: number; salaId: number | null }[]): Promise<void>;
  publicar(): Promise<void>;
}
export const resultadosHorariosRepository = {
  leer(id: number) {
    return db.transaction(tx => cargar(tx, id), { isolationLevel: "repeatable read", accessMode: "read only" });
  },
  async conBloqueo<T>(id: number, operar: (contexto: ContextoResultado, persistencia: PersistenciaResultado) => Promise<T>): Promise<T> {
    return db.transaction(async tx => {
      const inicial = await tx.query.planificacionesSemestres.findFirst({ where: eq(planificacionesSemestres.id, id) });
      if (!inicial) throw new NotFoundError("Planificación no encontrada.");
      // Match the lock order used by every preparation write and period transition.
      await tx.select({ id: carreras.id }).from(carreras).where(eq(carreras.id, inicial.carreraId)).for("update");
      const [planificacion] = await tx.select().from(planificacionesSemestres).where(eq(planificacionesSemestres.id, id)).for("update");
      if (!planificacion || planificacion.carreraId !== inicial.carreraId) throw new ConflictError("La planificación cambió; vuelva a consultar.");
      const contexto = await cargar(tx, id);
      const persistencia: PersistenciaResultado = {
        async mover(cambios) {
          const originales = await tx.select().from(horariosAsignaturas).where(and(eq(horariosAsignaturas.planificacionSemestreId, id), inArray(horariosAsignaturas.id, cambios.map(cambio => cambio.id))));
          if (originales.length !== cambios.length) throw new ConflictError("El horario cambió; vuelva a consultar.");
          // Remove the complete group first, avoiding transient unique-index conflicts.
          await tx.delete(horariosAsignaturas).where(and(eq(horariosAsignaturas.planificacionSemestreId, id), inArray(horariosAsignaturas.id, cambios.map(cambio => cambio.id))));
          await tx.insert(horariosAsignaturas).values(originales.map(original => ({ ...original, bloqueId: cambios.find(cambio => cambio.id === original.id)!.bloqueId })));
        },
        async asignarSalas(cambios) {
          if (!cambios.length) return;
          const ids = cambios.map(cambio => cambio.id);
          // Release assignments together before applying a validated final state (room swaps).
          await tx.update(horariosAsignaturas).set({ salaId: null }).where(and(eq(horariosAsignaturas.planificacionSemestreId, id), inArray(horariosAsignaturas.id, ids)));
          for (const cambio of cambios) {
            const filas = await tx.update(horariosAsignaturas).set({ salaId: cambio.salaId }).where(and(eq(horariosAsignaturas.planificacionSemestreId, id), eq(horariosAsignaturas.id, cambio.id))).returning({ id: horariosAsignaturas.id });
            if (filas.length !== 1) throw new ConflictError("El horario cambió durante la importación.");
          }
        },
        async publicar() {
          await tx.update(planificacionesSemestres).set({ estadoPlanificacion: "publicado" }).where(eq(planificacionesSemestres.id, id));
        },
      };
      return operar(contexto, persistencia);
    });
  },
};
