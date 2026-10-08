import { eq } from "drizzle-orm";
import * as esquema from "../schema/index.js";
import type { BaseDatosSeed, CatalogosAcademicosSeed } from "./contexto.js";
import {
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

  const semestresAsegurados: (typeof esquema.semestres.$inferSelect)[] = [];
  for (const semestre of datosSemestres) semestresAsegurados.push(await asegurarSemestre(baseDatos, semestre));
  console.log(`✓ Asegurados ${semestresAsegurados.length} semestres`);

  return { carreras: carrerasAseguradas, departamentos: departamentosAsegurados };
}
