import { eq, ne } from "drizzle-orm";
import * as esquema from "../schema/index.js";
import type { BaseDatosSeed } from "./contexto.js";
import { sembrarAcademico } from "./academico.js";
import { sembrarUsuarios } from "./usuarios.js";

// Operación explícita solo para desarrollo, la carga ordinaria no elimina registros.
// Sustituye los datos académicos solo en el destino local permitido y dentro de una transacción.
export async function reemplazarAcademico(baseDatos: BaseDatosSeed, conexion: string, entorno: string) {
  const destino = new URL(conexion);
  if (entorno !== "development" || !["localhost", "127.0.0.1", "[::1]", "postgres"].includes(destino.hostname)
    || destino.pathname !== "/horarios_db") {
    throw new Error("El reemplazo académico solo permite la base local horarios_db en desarrollo");
  }
  await baseDatos.transaction(async tx => {
    const incompatibles = await tx.select({ id: esquema.profesores.id }).from(esquema.profesores)
      .innerJoin(esquema.usuarios, eq(esquema.profesores.usuarioId, esquema.usuarios.id))
      .where(ne(esquema.usuarios.rol, "profesor"));
    if (incompatibles.length) throw new Error("Hay profesores vinculados a cuentas administrativas; no se borraron datos");
    // Los horarios y la disponibilidad dependientes siguen sus claves foráneas en cascada existentes.
    await tx.delete(esquema.ofertasAsignaturas);
    await tx.delete(esquema.profesores);
    await tx.delete(esquema.usuarios).where(eq(esquema.usuarios.rol, "profesor"));
    await tx.delete(esquema.asignaturas);
    const catalogos = await sembrarAcademico(tx);
    await sembrarUsuarios(tx, catalogos, true);
  });
}
