import { eq } from "drizzle-orm";
import { db } from "../config/db.js";
import { semestres, type Semestre, type NuevoSemestre } from "../db/schema/recursos.schema.js";

export const semestresRepository = {
  async findAll(): Promise<Semestre[]> {
    return await db.select().from(semestres);
  },

  async findById(id: number): Promise<Semestre | undefined> {
    const [result] = await db.select().from(semestres).where(eq(semestres.id, id)).limit(1);
    return result;
  },

  async findByCodigo(codigo: string): Promise<Semestre | undefined> {
    const [result] = await db.select().from(semestres).where(eq(semestres.codigo, codigo)).limit(1);
    return result;
  },

  async create(data: NuevoSemestre): Promise<Semestre> {
    const [created] = await db.insert(semestres).values(data).returning();
    return created;
  },

  async update(id: number, data: Partial<Omit<NuevoSemestre, "id">>): Promise<Semestre | undefined> {
    const [updated] = await db
      .update(semestres)
      .set(data)
      .where(eq(semestres.id, id))
      .returning();
    return updated;
  },

  async delete(id: number): Promise<boolean> {
    const [deleted] = await db.delete(semestres).where(eq(semestres.id, id)).returning();
    return !!deleted;
  },
};
