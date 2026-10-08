import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "../config/env.js";
import * as esquema from "./schema/index.js";
import { sembrarAcademico } from "./seeds/academico.js";
import { sembrarHorarios } from "./seeds/horarios.js";
import { sembrarUsuarios } from "./seeds/usuarios.js";

async function seed() {
  console.log("Conectando a la base de datos para ejecutar el seed...");
  const cliente = postgres(env.DATABASE_URL, { max: 1 });
  const baseDatos = drizzle(cliente, { schema: esquema });

  console.log("Poblando catálogos base sin borrar datos existentes...");
  const catalogos = await sembrarAcademico(baseDatos);
  await sembrarHorarios(baseDatos);
  await sembrarUsuarios(baseDatos, catalogos);

  console.log("\nSeed completado con éxito.");
  await cliente.end();
  process.exit(0);
}

seed().catch((error) => {
  console.error("Error durante el seed:", error);
  process.exit(1);
});
