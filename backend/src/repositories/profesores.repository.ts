import { eq } from "drizzle-orm";
import { db } from "../config/db.js";
import { profesores, type Profesor, type NuevoProfesor } from "../db/schema/profesores.schema.js";
import { departamentos } from "../db/schema/departamentos.schema.js";
import { usuarios } from "../db/schema/usuarios.schema.js";

export const profesoresRepository = {
  async findAll() {
    return await db.query.profesores.findMany({
      with: {
        departamento: true,
        usuario: true,
        disponibilidades: true,
        ofertas: true,
      },
    });
  },

  async findById(id: number) {
    return await db.query.profesores.findFirst({
      where: eq(profesores.id, id),
      with: {
        departamento: true,
        usuario: true,
        disponibilidades: true,
        ofertas: true,
      },
    });
  },

  async findByUsuarioId(usuarioId: number) {
    return await db.query.profesores.findFirst({
      where: eq(profesores.usuarioId, usuarioId),
    });
  },

  async checkDepartamentoExists(departamentoId: number): Promise<boolean> {
    const [dept] = await db
      .select({ id: departamentos.id })
      .from(departamentos)
      .where(eq(departamentos.id, departamentoId))
      .limit(1);
    return !!dept;
  },

  async checkUsuarioExists(usuarioId: number): Promise<boolean> {
    const [user] = await db
      .select({ id: usuarios.id })
      .from(usuarios)
      .where(eq(usuarios.id, usuarioId))
      .limit(1);
    return !!user;
  },

  async create(data: NuevoProfesor): Promise<Profesor> {
    const [created] = await db.insert(profesores).values(data).returning();
    return created;
  },

  async update(id: number, data: Partial<Omit<NuevoProfesor, "id">>): Promise<Profesor | undefined> {
    const [updated] = await db
      .update(profesores)
      .set(data)
      .where(eq(profesores.id, id))
      .returning();
    return updated;
  },

  async delete(id: number): Promise<boolean> {
    const [deleted] = await db
      .delete(profesores)
      .where(eq(profesores.id, id))
      .returning();
    return !!deleted;
  },
};
