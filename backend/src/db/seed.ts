import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "../config/env.js";
import * as schema from "./schema/index.js";

async function seed() {
  console.log("Conectando a la base de datos para ejecutar el seed...");
  const client = postgres(env.DATABASE_URL, { max: 1 });
  const db = drizzle(client, { schema });

  console.log("Poblando catálogos base...");

  // 1. Tipos de Hora (Teórica, Práctica, Laboratorio)
  const insertedTiposHora = await db
    .insert(schema.tiposHora)
    .values([
      { tipo: "Teórica" },
      { tipo: "Práctica" },
      { tipo: "Laboratorio" },
    ])
    .returning();
  console.log(`✓ Insertados ${insertedTiposHora.length} tipos de hora`);

  // 2. Departamentos
  const insertedDepartamentos = await db
    .insert(schema.departamentos)
    .values([
      { nombre: "Sistemas de Información" },
      { nombre: "Economía y Finanzas" },
      { nombre: "Administración y Auditoría" },
    ])
    .returning();
  console.log(`✓ Insertados ${insertedDepartamentos.length} departamentos`);

  // 3. Carreras
  const insertedCarreras = await db
    .insert(schema.carreras)
    .values([
      { nombre: "Ingeniería Civil en Informática" },
      { nombre: "Ingeniería de Ejecución en Computación e Informática" },
    ])
    .returning();
  console.log(`✓ Insertadas ${insertedCarreras.length} carreras`);

  // 4. Relación Carrera - Departamento (Los 3 departamentos prestan servicios a las 2 carreras)
  const relacionesCarreraDepto = [];
  for (const carrera of insertedCarreras) {
    for (const depto of insertedDepartamentos) {
      relacionesCarreraDepto.push({
        carreraId: carrera.id,
        departamentoId: depto.id,
      });
    }
  }
  await db.insert(schema.carreraDepartamento).values(relacionesCarreraDepto);
  console.log(`✓ Asociadas ${relacionesCarreraDepto.length} relaciones entre carreras y departamentos`);

  // 5. Semestres
  const insertedSemestres = await db
    .insert(schema.semestres)
    .values([
      { codigo: "2026-1", nombre: "Primer Semestre 2026", anio: 2026 },
      { codigo: "2026-2", nombre: "Segundo Semestre 2026", anio: 2026 },
    ])
    .returning();
  console.log(`✓ Insertados ${insertedSemestres.length} semestres`);

  // 6. Bloques Horarios (Inician a las 8:10, 40 min por bloque, 10 min de descanso cada 2 bloques)
  const dias = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes"];
  const modulos = [
    { horaInicio: "08:10", horaTermino: "08:50" }, // Bloque 1
    { horaInicio: "08:50", horaTermino: "09:30" }, // Bloque 2
    // Salto 10 min (09:30 - 09:40)
    { horaInicio: "09:40", horaTermino: "10:20" }, // Bloque 3
    { horaInicio: "10:20", horaTermino: "11:00" }, // Bloque 4
    // Salto 10 min (11:00 - 11:10)
    { horaInicio: "11:10", horaTermino: "11:50" }, // Bloque 5
    { horaInicio: "11:50", horaTermino: "12:30" }, // Bloque 6
    // Salto 10 min (12:30 - 12:40)
    { horaInicio: "12:40", horaTermino: "13:20" }, // Bloque 7
    { horaInicio: "13:20", horaTermino: "14:00" }, // Bloque 8
    // Salto 10 min (14:00 - 14:10)
    { horaInicio: "14:10", horaTermino: "14:50" }, // Bloque 9
    { horaInicio: "14:50", horaTermino: "15:30" }, // Bloque 10
    // Salto 10 min (15:30 - 15:40)
    { horaInicio: "15:40", horaTermino: "16:20" }, // Bloque 11
    { horaInicio: "16:20", horaTermino: "17:00" }, // Bloque 12
    // Salto 10 min (17:00 - 17:10)
    { horaInicio: "17:10", horaTermino: "17:50" }, // Bloque 13
    { horaInicio: "17:50", horaTermino: "18:30" }, // Bloque 14
    // Salto 10 min (18:30 - 18:40)
    { horaInicio: "18:40", horaTermino: "19:20" }, // Bloque 15
    { horaInicio: "19:20", horaTermino: "20:00" }, // Bloque 16
  ];

  const bloquesData = dias.flatMap((dia) =>
    modulos.map((m) => ({
      dia,
      horaInicio: m.horaInicio,
      horaTermino: m.horaTermino,
    }))
  );

  const insertedBloques = await db.insert(schema.bloquesHorarios).values(bloquesData).returning();
  console.log(`✓ Insertados ${insertedBloques.length} bloques horarios (${modulos.length} módulos por 5 días)`);

  // 7. Salas (Tipo: "Sala" o "Laboratorio")
  const insertedSalas = await db
    .insert(schema.salas)
    .values([
      { nombre: "Sala A-101", capacidad: 45, tipo: "Sala" },
      { nombre: "Sala A-102", capacidad: 40, tipo: "Sala" },
      { nombre: "Sala B-201", capacidad: 35, tipo: "Sala" },
      { nombre: "Lab Computación 1", capacidad: 30, tipo: "Laboratorio" },
      { nombre: "Lab Computación 2", capacidad: 25, tipo: "Laboratorio" },
      { nombre: "Lab Redes y Hardware", capacidad: 25, tipo: "Laboratorio" },
    ])
    .returning();
  console.log(`✓ Insertadas ${insertedSalas.length} salas`);

  console.log("\nSeed completado con éxito.");
  await client.end();
  process.exit(0);
}

seed().catch((err) => {
  console.error("Error durante el seed:", err);
  process.exit(1);
});
