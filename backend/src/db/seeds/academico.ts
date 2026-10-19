import { and, eq } from "drizzle-orm";
import * as esquema from "../schema/index.js";
import type { BaseDatosSeed, CatalogosAcademicosSeed } from "./contexto.js";
import {
  datosAsignaturas,
  datosTiposHora,
  datosDepartamentos,
  datosCarreras,
  departamentosGestionados,
  datosSemestres,
} from "./data/academico.js";

async function asegurarTipoHora(baseDatos: BaseDatosSeed, tipo: typeof datosTiposHora[number]) {
  const [existente] = await baseDatos.select().from(esquema.tiposHora).where(eq(esquema.tiposHora.tipo, tipo.tipo)).limit(1);
  if (existente) return existente;
  const [insertado] = await baseDatos.insert(esquema.tiposHora).values(tipo).returning();
  return insertado;
}

async function asegurarDepartamento(baseDatos: BaseDatosSeed, departamento: typeof datosDepartamentos[number]) {
  const [existente] = await baseDatos.select().from(esquema.departamentos).where(eq(esquema.departamentos.nombre, departamento.nombre)).limit(1);
  if (existente) return existente;
  const [insertado] = await baseDatos.insert(esquema.departamentos).values(departamento).returning();
  return insertado;
}

async function asegurarCarrera(baseDatos: BaseDatosSeed, carrera: typeof datosCarreras[number]) {
  const [existente] = await baseDatos.select().from(esquema.carreras).where(eq(esquema.carreras.nombre, carrera.nombre)).limit(1);
  if (existente) return existente;
  const [insertada] = await baseDatos.insert(esquema.carreras).values(carrera).returning();
  return insertada;
}

async function asegurarSemestre(baseDatos: BaseDatosSeed, semestre: typeof datosSemestres[number]) {
  const [existente] = await baseDatos.select().from(esquema.semestres).where(eq(esquema.semestres.codigo, semestre.codigo)).limit(1);
  if (existente) {
    const [actualizado] = await baseDatos
      .update(esquema.semestres)
      .set({ anio: semestre.anio, actual: semestre.actual })
      .where(eq(esquema.semestres.id, existente.id))
      .returning();
    return actualizado;
  }
  const [insertado] = await baseDatos.insert(esquema.semestres).values(semestre).returning();
  return insertado;
}

export async function sembrarAcademico(baseDatos: BaseDatosSeed): Promise<CatalogosAcademicosSeed> {
  const tiposHoraAsegurados: (typeof esquema.tiposHora.$inferSelect)[] = [];
  for (const tipoHora of datosTiposHora) tiposHoraAsegurados.push(await asegurarTipoHora(baseDatos, tipoHora));
  console.log(`✓ Asegurados ${tiposHoraAsegurados.length} tipos de hora`);

  const departamentosAsegurados: (typeof esquema.departamentos.$inferSelect)[] = [];
  for (const departamento of datosDepartamentos) departamentosAsegurados.push(await asegurarDepartamento(baseDatos, departamento));
  console.log(`✓ Asegurados ${departamentosAsegurados.length} departamentos`);

  const carrerasAseguradas: (typeof esquema.carreras.$inferSelect)[] = [];
  for (const carrera of datosCarreras) carrerasAseguradas.push(await asegurarCarrera(baseDatos, carrera));
  console.log(`✓ Aseguradas ${carrerasAseguradas.length} carreras`);

  const relacionesCarreraDepartamento = carrerasAseguradas.flatMap((carrera) =>
    departamentosAsegurados.map((departamento) => ({
      carreraId: carrera.id,
      departamentoId: departamento.id,
      esGestionado: departamentosGestionados.has(departamento.nombre),
    }))
  );
  for (const relacion of relacionesCarreraDepartamento) {
    await baseDatos
      .insert(esquema.carreraDepartamento)
      .values(relacion)
      .onConflictDoUpdate({
        target: [esquema.carreraDepartamento.carreraId, esquema.carreraDepartamento.departamentoId],
        set: { esGestionado: relacion.esGestionado },
      });
  }
  console.log(`✓ Aseguradas ${relacionesCarreraDepartamento.length} relaciones entre carreras y departamentos`);

  for (const { departamento, carreras, ...asignatura } of datosAsignaturas) {
    const departamentoAsignado = departamentosAsegurados.find((dato) => dato.nombre === departamento);
    if (!departamentoAsignado) throw new Error(`Departamento del seed no encontrado: ${departamento}`);
    await baseDatos.insert(esquema.asignaturas).values({ ...asignatura, departamentoId: departamentoAsignado.id }).onConflictDoNothing();
    for (const nombreCarrera of carreras) {
      const carrera = carrerasAseguradas.find((dato) => dato.nombre === nombreCarrera);
      if (!carrera) throw new Error(`Carrera del seed no encontrada: ${nombreCarrera}`);
      await baseDatos.insert(esquema.carreraAsignatura).values({ carreraId: carrera.id, asignaturaCodigo: asignatura.codigo }).onConflictDoNothing();
    }
  }
  console.log(`✓ Aseguradas ${datosAsignaturas.length} asignaturas con departamento explícito`);

  const semestresAsegurados: (typeof esquema.semestres.$inferSelect)[] = [];
  for (const semestre of datosSemestres) semestresAsegurados.push(await asegurarSemestre(baseDatos, semestre));
  console.log(`✓ Asegurados ${semestresAsegurados.length} semestres`);

  for (const carrera of carrerasAseguradas) {
    const [planificacionActual] = await baseDatos.select().from(esquema.planificacionesSemestres)
      .where(and(eq(esquema.planificacionesSemestres.carreraId, carrera.id), eq(esquema.planificacionesSemestres.actual, true)))
      .limit(1);
    // No reemplazar otro periodo actual ni reactivar planificaciones existentes.
    await baseDatos.insert(esquema.planificacionesSemestres).values(datosSemestres.map((semestre) => ({
      carreraId: carrera.id,
      codigo: semestre.codigo,
      anio: semestre.anio,
      actual: semestre.actual && !planificacionActual,
    }))).onConflictDoNothing({
      target: [esquema.planificacionesSemestres.carreraId, esquema.planificacionesSemestres.codigo],
    });
  }
  console.log(`✓ Aseguradas planificaciones para ${carrerasAseguradas.length} carreras`);

  return { carreras: carrerasAseguradas, departamentos: departamentosAsegurados };
}
