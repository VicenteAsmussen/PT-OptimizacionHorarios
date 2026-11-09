import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { env } from "../config/env.js";

async function ejecutarMigraciones() {
  console.log("Iniciando migraciones...");
  const conexion = postgres(env.DATABASE_URL, { max: 1 });
  try {
    const baseDatos = drizzle(conexion);
    await migrate(baseDatos, { migrationsFolder: "./src/db/migrations" });
  } catch (error) {
    try {
      await conexion.end();
    } catch {
      // Conservar el error primario aunque también falle el cierre.
    }
    throw error;
  }
  await conexion.end();
  console.log("Migraciones aplicadas correctamente.");
  process.exit(0);
}

ejecutarMigraciones().catch(() => {
  console.error("No se pudieron aplicar las migraciones.");
  process.exit(1);
});
