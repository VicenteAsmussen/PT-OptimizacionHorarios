import { eq } from "drizzle-orm";
import { db } from "../config/db.js";
import {
  usuarios,
  secretarias,
  type Usuario,
  type NuevoUsuario,
} from "../db/schema/usuarios.schema.js";
import { carreras } from "../db/schema/departamentos.schema.js";

export const usuariosRepository = {
  async findAll() {
    return await db.query.usuarios.findMany({
      with: {
        secretaria: {
          with: {
            carrera: true,
          },
        },
        profesor: true,
      },
    });
  },

  async findById(id: number) {
    return await db.query.usuarios.findFirst({
      where: eq(usuarios.id, id),
      with: {
        secretaria: {
          with: {
            carrera: true,
          },
        },
        profesor: true,
      },
    });
  },

  async findByCorreo(correo: string) {
    return await db.query.usuarios.findFirst({
      where: eq(usuarios.correo, correo),
      with: {
        secretaria: {
          with: {
            carrera: true,
          },
        },
        profesor: true,
      },
    });
  },

  async checkCarreraExists(carreraId: number): Promise<boolean> {
    const [carrera] = await db
      .select({ id: carreras.id })
      .from(carreras)
      .where(eq(carreras.id, carreraId))
      .limit(1);
    return !!carrera;
  },

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

  async update(
    id: number,
    data: Partial<Omit<NuevoUsuario, "id">>,
    carreraId?: number
  ) {
    return await db.transaction(async (tx) => {
      if (Object.keys(data).length > 0) {
        await tx.update(usuarios).set(data).where(eq(usuarios.id, id));
      }

      // If user rol is updated or carreraId provided
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
          profesor: true,
        },
      });
    });
  },

  async delete(id: number): Promise<boolean> {
    const [deleted] = await db
      .delete(usuarios)
      .where(eq(usuarios.id, id))
      .returning();
    return !!deleted;
  },
};
