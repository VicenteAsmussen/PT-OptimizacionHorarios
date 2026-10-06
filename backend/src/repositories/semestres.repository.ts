import { eq } from "drizzle-orm";
import { db } from "../config/db.js";
import { semestres, type Semestre, type NuevoSemestre } from "../db/schema/semestres.schema.js";

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

  async findActual(): Promise<Semestre | undefined> {
    const [result] = await db.select().from(semestres).where(eq(semestres.actual, true)).limit(1);
    return result;
  },

  async setActual(id: number): Promise<Semestre | undefined> {
    return await this.update(id, { actual: true });
  },

  async create(data: NuevoSemestre): Promise<Semestre> {
    return await db.transaction(async (tx) => {
      if (data.actual) await tx.update(semestres).set({ actual: false });
      const [created] = await tx.insert(semestres).values(data).returning();
      return created;
    });
  },

  async update(id: number, data: Partial<Omit<NuevoSemestre, "id">>): Promise<Semestre | undefined> {
    return await db.transaction(async (tx) => {
      if (data.actual === true) {
        const [existing] = await tx.select().from(semestres).where(eq(semestres.id, id)).for("update");
        if (!existing) return undefined;
        await tx.update(semestres).set({ actual: false });
      }
      if (!Object.keys(data).length) {
        const [existing] = await tx.select().from(semestres).where(eq(semestres.id, id));
        return existing;
      }
      const [updated] = await tx.update(semestres).set(data).where(eq(semestres.id, id)).returning();
      return updated;
    });
  },

  async delete(id: number): Promise<boolean> {
    const [deleted] = await db.delete(semestres).where(eq(semestres.id, id)).returning();
    return !!deleted;
  },
};
