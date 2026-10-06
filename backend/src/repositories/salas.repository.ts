import { eq } from "drizzle-orm";
import { db } from "../config/db.js";
import { salas, type Sala, type NuevaSala } from "../db/schema/salas.schema.js";

export const salasRepository = {
  async findAll(): Promise<Sala[]> {
    return await db.select().from(salas);
  },

  async findById(id: number): Promise<Sala | undefined> {
    const [result] = await db.select().from(salas).where(eq(salas.id, id)).limit(1);
    return result;
  },

  async findByNombre(nombre: string): Promise<Sala | undefined> {
    const [result] = await db.select().from(salas).where(eq(salas.nombre, nombre)).limit(1);
    return result;
  },

  async create(data: NuevaSala): Promise<Sala> {
    const [created] = await db.insert(salas).values(data).returning();
    return created;
  },

  async update(id: number, data: Partial<Omit<NuevaSala, "id">>): Promise<Sala | undefined> {
    const [updated] = await db
      .update(salas)
      .set(data)
      .where(eq(salas.id, id))
      .returning();
    return updated;
  },

  async delete(id: number): Promise<boolean> {
    const [deleted] = await db.delete(salas).where(eq(salas.id, id)).returning();
    return !!deleted;
  },
};
