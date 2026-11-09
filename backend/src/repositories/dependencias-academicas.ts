import { eq, inArray } from "drizzle-orm";
import { db } from "../config/db.js";
import { asignaturas, carreras, carreraAsignatura, carreraDepartamento, departamentos,
  disponibilidadProfesores, horariosAsignaturas, ofertasAsignaturas, ofertaTipoHora,
  planificacionesSemestres, profesores, salas } from "../db/schema/index.js";
import { ConflictError } from "../utils/errors.js";
import type { TransaccionPlanificacion } from "./planificacion-escritura.js";

type Lectura = Pick<TransaccionPlanificacion, "query">;
type Catalogo = { tipo: "sala" | "carrera" | "departamento" | "profesor"; id: number }
  | { tipo: "asignatura"; codigo: string };

// Barrera institucional conservadora: comparte el orden carrera → planificación
// con las escrituras operativas. No exige Preparación ni cambia períodos.
// La consulta de dependencias y la mutación siempre ocurren dentro de esta barrera.
export function conCatalogosBloqueados<T>(escribir: (tx: TransaccionPlanificacion) => Promise<T>): Promise<T> {
  return db.transaction(async tx => {
    await tx.select({ id: carreras.id }).from(carreras).orderBy(carreras.id).for("update");
    await tx.select({ id: planificacionesSemestres.id }).from(planificacionesSemestres)
      .orderBy(planificacionesSemestres.id).for("update");
    return escribir(tx);
  }, { isolationLevel: "read committed" });
}

export async function tieneDependenciasProfesor(tx: Lectura, id: number): Promise<boolean> {
  return !!await tx.query.disponibilidadProfesores.findFirst({ where: eq(disponibilidadProfesores.profesorId, id) })
    // Todo horario docente referencia una asignación por FK compuesta.
    || !!await tx.query.ofertaTipoHora.findFirst({ where: eq(ofertaTipoHora.profesorId, id) });
}

export async function tieneDependenciasAsignatura(tx: Lectura, codigo: string): Promise<boolean> {
  return !!await tx.query.ofertasAsignaturas.findFirst({ where: eq(ofertasAsignaturas.asignaturaCodigo, codigo) });
}

async function tieneDependenciasDepartamento(tx: Lectura, id: number): Promise<boolean> {
  const materias = await tx.query.asignaturas.findMany({ where: eq(asignaturas.departamentoId, id) });
  for (const materia of materias) if (await tieneDependenciasAsignatura(tx, materia.codigo)) return true;
  const docentes = await tx.query.profesores.findMany({ where: eq(profesores.departamentoId, id) });
  for (const docente of docentes) if (await tieneDependenciasProfesor(tx, docente.id)) return true;
  return false;
}

async function tieneDependenciasCarrera(tx: Lectura, id: number): Promise<boolean> {
  const periodos = await tx.query.planificacionesSemestres.findMany({ where: eq(planificacionesSemestres.carreraId, id) });
  const ids = periodos.map(periodo => periodo.id);
  if (ids.length && (
    await tx.query.ofertasAsignaturas.findFirst({ where: inArray(ofertasAsignaturas.planificacionSemestreId, ids) })
    || await tx.query.disponibilidadProfesores.findFirst({ where: inArray(disponibilidadProfesores.planificacionSemestreId, ids) })
    || await tx.query.horariosAsignaturas.findFirst({ where: inArray(horariosAsignaturas.planificacionSemestreId, ids) })
  )) return true;
  const malla = await tx.query.carreraAsignatura.findMany({ where: eq(carreraAsignatura.carreraId, id) });
  for (const materia of malla) if (await tieneDependenciasAsignatura(tx, materia.asignaturaCodigo)) return true;
  const relaciones = await tx.query.carreraDepartamento.findMany({ where: eq(carreraDepartamento.carreraId, id) });
  for (const relacion of relaciones) if (await tieneDependenciasDepartamento(tx, relacion.departamentoId)) return true;
  return false;
}

async function fijarDepartamento(tx: TransaccionPlanificacion, id: number): Promise<void> {
  await tx.select({ id: departamentos.id }).from(departamentos).where(eq(departamentos.id, id)).for("update");
  await tx.select({ codigo: asignaturas.codigo }).from(asignaturas).where(eq(asignaturas.departamentoId, id))
    .orderBy(asignaturas.codigo).for("update");
  await tx.select({ id: profesores.id }).from(profesores).where(eq(profesores.departamentoId, id))
    .orderBy(profesores.id).for("update");
}

export async function exigirCatalogoSinDependencias(tx: TransaccionPlanificacion, catalogo: Catalogo): Promise<void> {
  // FOR UPDATE también excluye nuevas referencias FK mientras se comprueba el uso.
  let utilizado: boolean;
  switch (catalogo.tipo) {
    case "sala":
      await tx.select({ id: salas.id }).from(salas).where(eq(salas.id, catalogo.id)).for("update");
      utilizado = !!await tx.query.horariosAsignaturas.findFirst({ where: eq(horariosAsignaturas.salaId, catalogo.id) });
      break;
    case "asignatura":
      await tx.select({ codigo: asignaturas.codigo }).from(asignaturas).where(eq(asignaturas.codigo, catalogo.codigo)).for("update");
      utilizado = await tieneDependenciasAsignatura(tx, catalogo.codigo);
      break;
    case "departamento":
      await fijarDepartamento(tx, catalogo.id);
      utilizado = await tieneDependenciasDepartamento(tx, catalogo.id);
      break;
    case "carrera":
      // Fijar los extremos transitivos ante nuevas referencias de otras carreras.
      for (const relacion of (await tx.query.carreraDepartamento.findMany({
        where: eq(carreraDepartamento.carreraId, catalogo.id),
      })).sort((primera, segunda) => primera.departamentoId - segunda.departamentoId)) {
        await fijarDepartamento(tx, relacion.departamentoId);
      }
      for (const materia of (await tx.query.carreraAsignatura.findMany({
        where: eq(carreraAsignatura.carreraId, catalogo.id),
      })).sort((primera, segunda) => primera.asignaturaCodigo.localeCompare(segunda.asignaturaCodigo))) {
        await tx.select({ codigo: asignaturas.codigo }).from(asignaturas)
          .where(eq(asignaturas.codigo, materia.asignaturaCodigo)).for("update");
      }
      utilizado = await tieneDependenciasCarrera(tx, catalogo.id);
      break;
    case "profesor":
      await tx.select({ id: profesores.id }).from(profesores).where(eq(profesores.id, catalogo.id)).for("update");
      utilizado = await tieneDependenciasProfesor(tx, catalogo.id);
      break;
  }
  if (utilizado) throw new ConflictError(catalogo.tipo === "profesor"
    ? "No se puede eliminar el profesor porque tiene dependencias académicas. Puedes quitar su acceso al sistema."
    : "El registro tiene dependencias académicas y solo se puede consultar");
}
