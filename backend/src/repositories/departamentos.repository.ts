import { eq } from "drizzle-orm";
import { db } from "../config/db.js";
import { departamentos, type Departamento, type NuevoDepartamento } from "../db/schema/departamentos.schema.js";

export const departamentosRepository = {
  async findAll() {
    return await db.query.departamentos.findMany({
      with: {
        carreraDepartamentos: {
          with: {
            carrera: true,
          },
        },
        profesores: true,
      },
    });
  },

  async findById(id: number) {
    return await db.query.departamentos.findFirst({
      where: eq(departamentos.id, id),
      with: {
        carreraDepartamentos: {
          with: {
            carrera: true,
          },
        },
        profesores: true,
      },
    });
  },

  async findByNombre(nombre: string): Promise<Departamento | undefined> {
    const [result] = await db
      .select()
      .from(departamentos)
      .where(eq(departamentos.nombre, nombre))
      .limit(1);
    return result;
  },

  async create(data: NuevoDepartamento): Promise<Departamento> {
    const [created] = await db.insert(departamentos).values(data).returning();
    return created;
  },

  async update(id: number, data: Partial<Omit<NuevoDepartamento, "id">>): Promise<Departamento | undefined> {
    const [updated] = await db
      .update(departamentos)
      .set(data)
      .where(eq(departamentos.id, id))
      .returning();
    return updated;
  },

  async delete(id: number): Promise<boolean> {
    const [deleted] = await db
      .delete(departamentos)
      .where(eq(departamentos.id, id))
      .returning();
    return !!deleted;
  },
};
