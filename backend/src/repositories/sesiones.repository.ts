import { and, eq } from "drizzle-orm";
import { db } from "../config/db.js";
import { sesiones, type NuevaSesion } from "../db/schema/sesiones.schema.js";
import { usuarios, type Usuario } from "../db/schema/usuarios.schema.js";

export type TransaccionSesion = Parameters<Parameters<typeof db.transaction>[0]>[0];
type CredencialesSesion = Pick<Usuario, "id" | "correo" | "clave" | "rol" | "versionSesion">;

export const sesionesRepository = {
  async createConCredenciales(credenciales: CredencialesSesion, sesion: NuevaSesion): Promise<boolean> {
    return db.transaction(async (tx) => {
      // Comparte el bloqueo de fila de las actualizaciones y bajas de cuenta.
      const [actual] = await tx.select({
        id: usuarios.id, correo: usuarios.correo, clave: usuarios.clave,
        rol: usuarios.rol, versionSesion: usuarios.versionSesion,
      }).from(usuarios).where(eq(usuarios.id, credenciales.id)).for("update");
      if (!actual || actual.versionSesion !== credenciales.versionSesion || actual.clave !== credenciales.clave ||
          actual.correo !== credenciales.correo || actual.rol !== credenciales.rol || sesion.usuarioId !== actual.id) {
        return false;
      }
      await tx.insert(sesiones).values(sesion);
      return true;
    });
  },

  async findById(id: string) {
    const [sesion] = await db.select({
      id: sesiones.id, usuarioId: sesiones.usuarioId, expiraEn: sesiones.expiraEn,
      usuario: { id: usuarios.id, nombre: usuarios.nombre, correo: usuarios.correo, rol: usuarios.rol },
    }).from(sesiones).innerJoin(usuarios, eq(sesiones.usuarioId, usuarios.id))
      .where(eq(sesiones.id, id)).limit(1);
    return sesion;
  },

  async deleteById(id: string, usuarioId: number): Promise<void> {
    await db.delete(sesiones).where(and(eq(sesiones.id, id), eq(sesiones.usuarioId, usuarioId)));
  },

  async deleteByUsuarioId(usuarioId: number, tx: TransaccionSesion): Promise<void> {
    await tx.delete(sesiones).where(eq(sesiones.usuarioId, usuarioId));
  },
};
