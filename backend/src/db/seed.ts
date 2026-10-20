import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "../config/env.js";
import * as esquema from "./schema/index.js";
import { sembrarAcademico } from "./seeds/academico.js";
import { sembrarHorarios } from "./seeds/horarios.js";
import { sembrarUsuarios } from "./seeds/usuarios.js";
import { reemplazarAcademico } from "./seeds/reemplazo.js";

async function seed() {
  const argumentos = process.argv.slice(2);
  if (argumentos.length > 1 || argumentos.some(argumento => argumento !== "--reemplazar-academico")) {
    throw new Error("Uso: pnpm run db:seed [--reemplazar-academico]");
  }
  console.log("Conectando a la base de datos para ejecutar el seed...");
  const cliente = postgres(env.DATABASE_URL, { max: 1 });
  const baseDatos = drizzle(cliente, { schema: esquema });

  try {
    if (argumentos.includes("--reemplazar-academico")) {
      console.log("Reemplazando asignaturas, profesores y sus datos dependientes en la base local...");
      await reemplazarAcademico(baseDatos, env.DATABASE_URL, env.NODE_ENV);
    } else {
      console.log("Poblando catálogos base sin borrar datos existentes...");
      const catalogos = await sembrarAcademico(baseDatos);
      await sembrarHorarios(baseDatos);
      await sembrarUsuarios(baseDatos, catalogos);
    }

    console.log("\nSeed completado con éxito.");
  } finally {
    await cliente.end();
  }
  process.exit(0);
}

seed().catch((error) => {
  console.error("Error durante el seed:", error);
  process.exit(1);
});
