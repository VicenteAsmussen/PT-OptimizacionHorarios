import { and, asc, eq } from "drizzle-orm";
import * as esquema from "../schema/index.js";
import type { BaseDatosSeed } from "./contexto.js";
import { datosBloques, datosSalas, dias, modulos, datosPlanificacionHorarios } from "./data/horarios.js";

async function asegurarBloques(baseDatos: BaseDatosSeed) {
  for (const bloque of datosBloques) {
    await baseDatos
      .insert(esquema.bloquesHorarios)
      .values(bloque)
      .onConflictDoUpdate({
        target: [esquema.bloquesHorarios.dia, esquema.bloquesHorarios.numeroBloque],
        set: {
          horaInicio: bloque.horaInicio,
          horaTermino: bloque.horaTermino,
        },
      });
  }
}

async function asegurarSala(baseDatos: BaseDatosSeed, sala: typeof datosSalas[number]) {
  const [existente] = await baseDatos.select().from(esquema.salas).where(eq(esquema.salas.nombre, sala.nombre)).limit(1);
  if (existente) {
    const [actualizada] = await baseDatos
      .update(esquema.salas)
      .set({ capacidad: sala.capacidad, tipo: sala.tipo })
      .where(eq(esquema.salas.id, existente.id))
      .returning();
    return actualizada;
  }
  const [insertada] = await baseDatos.insert(esquema.salas).values(sala).returning();
  return insertada;
}

export async function sembrarPlanificacionHorarios(baseDatos: BaseDatosSeed) {
  // Solo lecturas de identidad del catálogo: nunca reemplaza usuarios/profesores.
  const docentes = await baseDatos.select({ id: esquema.profesores.id }).from(esquema.profesores).orderBy(asc(esquema.profesores.id));
  for (const fixture of datosPlanificacionHorarios) {
    await baseDatos.transaction(async tx => {
      const [carrera] = await tx.select().from(esquema.carreras).where(eq(esquema.carreras.nombre, fixture.carrera)).limit(1);
      if (!carrera) throw new Error(`Carrera explícita del seed inexistente: ${fixture.carrera}`);
      const [planificacion] = await tx.select().from(esquema.planificacionesSemestres)
        .where(and(eq(esquema.planificacionesSemestres.carreraId, carrera.id), eq(esquema.planificacionesSemestres.codigo, fixture.periodo))).for("update");
      if (!planificacion) throw new Error(`Planificación del seed inexistente: ${fixture.carrera}/${fixture.periodo}`);
      // El seed no reabre ni modifica propuestas/publicaciones existentes en una repetición.
      if (planificacion.estadoPlanificacion !== "preparacion") return;
      const [asignacion] = await tx.select().from(esquema.carreraAsignatura).where(and(eq(esquema.carreraAsignatura.carreraId, carrera.id), eq(esquema.carreraAsignatura.asignaturaCodigo, fixture.asignaturaCodigo))).limit(1);
      const profesor = docentes[fixture.profesorOrdinal];
      const [bloque] = await tx.select().from(esquema.bloquesHorarios).where(and(eq(esquema.bloquesHorarios.dia, fixture.dia), eq(esquema.bloquesHorarios.numeroBloque, fixture.numeroBloque))).limit(1);
      const [tipoHora] = await tx.select().from(esquema.tiposHora).where(eq(esquema.tiposHora.tipo, fixture.tipoHora)).limit(1);
      const [sala] = await tx.select().from(esquema.salas).where(eq(esquema.salas.nombre, fixture.sala)).limit(1);
      if (!asignacion || !profesor || !bloque || !tipoHora || !sala) throw new Error("Catálogo incompleto para el seed de planificación");
      const claveOferta = and(eq(esquema.ofertasAsignaturas.planificacionSemestreId, planificacion.id), eq(esquema.ofertasAsignaturas.asignaturaCodigo, fixture.asignaturaCodigo), eq(esquema.ofertasAsignaturas.seccion, fixture.seccion));
      await tx.insert(esquema.ofertasAsignaturas).values({ planificacionSemestreId: planificacion.id, asignaturaCodigo: fixture.asignaturaCodigo, profesorId: profesor.id, seccion: fixture.seccion, cupos: fixture.cupos }).onConflictDoNothing();
      const [oferta] = await tx.select().from(esquema.ofertasAsignaturas).where(claveOferta).limit(1);
      const [horario] = await tx.select({ id: esquema.horariosAsignaturas.id }).from(esquema.horariosAsignaturas).where(and(eq(esquema.horariosAsignaturas.ofertaId, oferta.id), eq(esquema.horariosAsignaturas.bloqueId, bloque.id))).limit(1);
      if (!horario) await tx.insert(esquema.horariosAsignaturas).values({ ofertaId: oferta.id, planificacionSemestreId: planificacion.id, bloqueId: bloque.id, tipoHoraId: tipoHora.id, salaId: sala.id });
      await tx.insert(esquema.disponibilidadProfesores).values({ profesorId: oferta.profesorId, planificacionSemestreId: planificacion.id, bloqueId: bloque.id }).onConflictDoNothing();
      await tx.update(esquema.planificacionesSemestres).set({ estadoPlanificacion: fixture.publicado ? "publicado" : "propuesta" }).where(eq(esquema.planificacionesSemestres.id, planificacion.id));
    });
  }
}

export async function sembrarHorarios(baseDatos: BaseDatosSeed) {
  await asegurarBloques(baseDatos);
  console.log(`✓ Asegurados ${datosBloques.length} bloques horarios (${modulos.length} módulos por ${dias.length} días)`);

  const salasAseguradas = [];
  for (const sala of datosSalas) salasAseguradas.push(await asegurarSala(baseDatos, sala));
  console.log(`✓ Aseguradas ${salasAseguradas.length} salas`);
}
