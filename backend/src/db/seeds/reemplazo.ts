import { eq, ne } from "drizzle-orm";
import * as esquema from "../schema/index.js";
import type { BaseDatosSeed } from "./contexto.js";
import { sembrarAcademico } from "./academico.js";
import { sembrarUsuarios } from "./usuarios.js";

// Explicit development-only operation; ordinary seeding never deletes records.
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
    // Child schedules and availability follow their existing cascading foreign keys.
    await tx.delete(esquema.ofertasAsignaturas);
    await tx.delete(esquema.profesores);
    await tx.delete(esquema.usuarios).where(eq(esquema.usuarios.rol, "profesor"));
    await tx.delete(esquema.asignaturas);
    const catalogos = await sembrarAcademico(tx);
    await sembrarUsuarios(tx, catalogos, true);
  });
}
