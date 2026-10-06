import { eq, inArray } from "drizzle-orm";
import { db } from "../config/db.js";
import {
  carreras,
  type Carrera,
  type NuevaCarrera,
} from "../db/schema/carreras.schema.js";
import { carreraDepartamento } from "../db/schema/carrera-departamento.schema.js";
import { departamentos } from "../db/schema/departamentos.schema.js";

export const carrerasRepository = {
  async findAll() {
    return await db.query.carreras.findMany({
      with: {
        carreraDepartamentos: {
          with: {
            departamento: true,
          },
        },
        carreraAsignaturas: {
          with: {
            asignatura: true,
          },
        },
      },
    });
  },

  async findById(id: number) {
    return await db.query.carreras.findFirst({
      where: eq(carreras.id, id),
      with: {
        carreraDepartamentos: {
          with: {
            departamento: true,
          },
        },
        carreraAsignaturas: {
          with: {
            asignatura: true,
          },
        },
      },
    });
  },

  async findByNombre(nombre: string): Promise<Carrera | undefined> {
    const [result] = await db
      .select()
      .from(carreras)
      .where(eq(carreras.nombre, nombre))
      .limit(1);
    return result;
  },

  async findExistingDepartamentosIds(ids: number[]): Promise<number[]> {
    if (ids.length === 0) return [];
    const results = await db
      .select({ id: departamentos.id })
      .from(departamentos)
      .where(inArray(departamentos.id, ids));
    return results.map((r) => r.id);
  },

  async create(data: NuevaCarrera, departamentosIds: number[] = []): Promise<Carrera> {
    return await db.transaction(async (tx) => {
      const [created] = await tx.insert(carreras).values(data).returning();

      if (departamentosIds.length > 0) {
        await tx.insert(carreraDepartamento).values(
          departamentosIds.map((departamentoId) => ({
            carreraId: created.id,
            departamentoId,
          }))
        );
      }

      return created;
    });
  },

  async update(
    id: number,
    data: Partial<Omit<NuevaCarrera, "id">>,
    departamentosIds?: number[]
  ) {
    return await db.transaction(async (tx) => {
      if (Object.keys(data).length > 0) {
        await tx.update(carreras).set(data).where(eq(carreras.id, id));
      }

      if (departamentosIds !== undefined) {
        await tx
          .delete(carreraDepartamento)
          .where(eq(carreraDepartamento.carreraId, id));

        if (departamentosIds.length > 0) {
          await tx.insert(carreraDepartamento).values(
            departamentosIds.map((departamentoId) => ({
              carreraId: id,
              departamentoId,
            }))
          );
        }
      }

      return await tx.query.carreras.findFirst({
        where: eq(carreras.id, id),
        with: {
          carreraDepartamentos: {
            with: {
              departamento: true,
            },
          },
          carreraAsignaturas: {
            with: {
              asignatura: true,
            },
          },
        },
      });
    });
  },

  async delete(id: number): Promise<boolean> {
    const [deleted] = await db
      .delete(carreras)
      .where(eq(carreras.id, id))
      .returning();
    return !!deleted;
  },
};
