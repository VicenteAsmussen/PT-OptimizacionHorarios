import { and, eq, sql } from "drizzle-orm";
import { db } from "../config/db.js";
import {
  usuarios,
  type Usuario,
  type NuevoUsuario,
} from "../db/schema/usuarios.schema.js";
import { secretarias } from "../db/schema/secretarias.schema.js";
import { carreras } from "../db/schema/carreras.schema.js";
import { columnasProfesorSinRut } from "../db/schema/profesores.schema.js";
import { ForbiddenError } from "../utils/errors.js";

type TransaccionUsuario = Parameters<Parameters<typeof db.transaction>[0]>[0];

export const usuariosRepository = {
  // Actualiza la cuenta e invalida sesiones al cambiar correo, clave o rol dentro de la transacción recibida.
  async updateEnTransaccion(tx: TransaccionUsuario, id: number, data: Partial<Omit<NuevoUsuario, "id" | "versionSesion">>, soloProfesor = false) {
    const datos = Object.fromEntries(Object.entries(data).filter(([, valor]) => valor !== undefined));
    if (Object.keys(datos).length === 0) return undefined;
    const revocar = datos.rol !== undefined || datos.clave !== undefined || datos.correo !== undefined;
    const [actualizado] = await tx.update(usuarios).set({
      ...datos,
      ...(revocar ? { versionSesion: sql`${usuarios.versionSesion} + 1` } : {}),
    }).where(and(eq(usuarios.id, id), soloProfesor ? eq(usuarios.rol, "profesor") : undefined)).returning();
    if (soloProfesor && !actualizado) throw new ForbiddenError("La cuenta vinculada no es una cuenta de profesor gestionable");
    return actualizado;
  },
  // Carga las cuentas y sus perfiles para la administración, dejando al servicio filtrar campos internos.
  async findAll() {
    return await db.query.usuarios.findMany({
      with: {
        secretaria: {
          with: {
            carrera: true,
          },
        },
        profesor: { columns: columnasProfesorSinRut },
      },
    });
  },

  // Recupera la cuenta vigente y sus perfiles para autenticación y mantenimiento.
  async findById(id: number) {
    return await db.query.usuarios.findFirst({
      where: eq(usuarios.id, id),
      with: {
        secretaria: {
          with: {
            carrera: true,
          },
        },
        profesor: { columns: columnasProfesorSinRut },
      },
    });
  },

  // Localiza la cuenta de acceso por correo para autenticación y detección de duplicados.
  async findByCorreo(correo: string) {
    return await db.query.usuarios.findFirst({
      where: eq(usuarios.correo, correo),
      with: {
        secretaria: {
          with: {
            carrera: true,
          },
        },
        profesor: { columns: columnasProfesorSinRut },
      },
    });
  },

  // Comprueba la carrera que se asignará al perfil de secretaría.
  async checkCarreraExists(carreraId: number): Promise<boolean> {
    const [carrera] = await db
      .select({ id: carreras.id })
      .from(carreras)
      .where(eq(carreras.id, carreraId))
      .limit(1);
    return !!carrera;
  },

  // Inserta la cuenta y, cuando corresponde, su perfil de secretaría en conjunto.
  async create(data: NuevoUsuario, carreraId?: number): Promise<Usuario> {
    return await db.transaction(async (tx) => {
      const [created] = await tx.insert(usuarios).values(data).returning();

      if (data.rol === "secretaria" && carreraId) {
        await tx.insert(secretarias).values({
          usuarioId: created.id,
          carreraId,
        });
      }

      return created;
    });
  },

  // Mantiene la cuenta y su perfil de secretaría en una transacción con revocación de sesiones pertinente.
  async update(
    id: number,
    data: Partial<Omit<NuevoUsuario, "id" | "versionSesion">>,
    carreraId?: number
  ) {
    return await db.transaction(async (tx) => {
      if (Object.keys(data).length > 0) {
        await usuariosRepository.updateEnTransaccion(tx, id, data);
      }

      // Ajusta el perfil de secretaría cuando cambia el rol o se indica una carrera.
      if (data.rol && data.rol !== "secretaria") {
        await tx.delete(secretarias).where(eq(secretarias.usuarioId, id));
      } else if (carreraId !== undefined) {
        const [existing] = await tx
          .select()
          .from(secretarias)
          .where(eq(secretarias.usuarioId, id))
          .limit(1);

        if (existing) {
          await tx
            .update(secretarias)
            .set({ carreraId })
            .where(eq(secretarias.usuarioId, id));
        } else {
          await tx.insert(secretarias).values({
            usuarioId: id,
            carreraId,
          });
        }
      }

      return await tx.query.usuarios.findFirst({
        where: eq(usuarios.id, id),
        with: {
          secretaria: {
            with: {
              carrera: true,
            },
          },
          profesor: { columns: columnasProfesorSinRut },
        },
      });
    });
  },

  // Elimina la cuenta de acceso con las acciones referenciales definidas por el esquema.
  async delete(id: number): Promise<boolean> {
    const [deleted] = await db
      .delete(usuarios)
      .where(eq(usuarios.id, id))
      .returning();
    return !!deleted;
  },
};
