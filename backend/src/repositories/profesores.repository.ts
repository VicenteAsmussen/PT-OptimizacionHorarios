import type { AlcanceCarrera } from "../utils/alcance-carrera.js";
import { eq, and, inArray } from "drizzle-orm";
import { db } from "../config/db.js";
import { profesores, type Profesor, type NuevoProfesor } from "../db/schema/profesores.schema.js";
import { departamentos } from "../db/schema/departamentos.schema.js";
import { usuarios, type NuevoUsuario } from "../db/schema/usuarios.schema.js";
import { ofertasAsignaturas } from "../db/schema/ofertas-asignaturas.schema.js";
import { disponibilidadProfesores } from "../db/schema/disponibilidad-profesores.schema.js";
import { horariosAsignaturas } from "../db/schema/horarios-asignaturas.schema.js";

export const profesoresRepository = {
  async findSeleccion() {
    return await db.select({
      id: profesores.id,
      nombre: profesores.nombre,
      rut: profesores.rut,
      departamento: { id: departamentos.id, nombre: departamentos.nombre },
    }).from(profesores)
      .innerJoin(departamentos, eq(profesores.departamentoId, departamentos.id));
  },

  async findAll(departamentoId?: number, alcance?: AlcanceCarrera) {
    return await db.query.profesores.findMany({
      where: and(departamentoId === undefined ? undefined : eq(profesores.departamentoId, departamentoId),
        alcance ? inArray(profesores.departamentoId, alcance.departamentosIds) : undefined),
      with: {
        departamento: true,
        usuario: true,
        disponibilidades: true,
        ofertas: alcance ? { where: inArray(ofertasAsignaturas.asignaturaCodigo, alcance.asignaturasCodigos) } : true,
      },
    });
  },

  async findById(id: number, alcance?: AlcanceCarrera) {
    return await db.query.profesores.findFirst({
      where: eq(profesores.id, id),
      with: {
        departamento: true,
        usuario: true,
        disponibilidades: true,
        ofertas: alcance ? { where: inArray(ofertasAsignaturas.asignaturaCodigo, alcance.asignaturasCodigos) } : true,
      },
    });
  },

  async findByRut(rut: string) {
    return await db.query.profesores.findFirst({
      where: eq(profesores.rut, rut),
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

  async checkCorreoUsuarioExists(correo: string): Promise<boolean> {
    const [user] = await db
      .select({ id: usuarios.id })
      .from(usuarios)
      .where(eq(usuarios.correo, correo))
      .limit(1);
    return !!user;
  },

  async hasHorarios(id: number): Promise<boolean> {
    const [horario] = await db
      .select({ id: horariosAsignaturas.id })
      .from(horariosAsignaturas)
      .innerJoin(ofertasAsignaturas, eq(horariosAsignaturas.ofertaId, ofertasAsignaturas.id))
      .where(eq(ofertasAsignaturas.profesorId, id))
      .limit(1);
    return !!horario;
  },

  async create(data: NuevoProfesor): Promise<Profesor> {
    const [created] = await db.insert(profesores).values(data).returning();
    return created;
  },

  async createWithUsuario(data: NuevoProfesor, usuario: NuevoUsuario): Promise<Profesor> {
    return await db.transaction(async (tx) => {
      const [createdUser] = await tx.insert(usuarios).values(usuario).returning();
      const [created] = await tx.insert(profesores).values({
        ...data,
        usuarioId: createdUser.id,
      }).returning();
      return created;
    });
  },

  async update(id: number, data: Partial<Omit<NuevoProfesor, "id">>): Promise<Profesor | undefined> {
    const [updated] = await db
      .update(profesores)
      .set(data)
      .where(eq(profesores.id, id))
      .returning();
    return updated;
  },

  async updateWithSyncedUsuarioName(id: number, data: Partial<Omit<NuevoProfesor, "id">>, usuarioId?: number | null) {
    return await db.transaction(async (tx) => {
      const [updated] = Object.keys(data).length > 0
        ? await tx.update(profesores).set(data).where(eq(profesores.id, id)).returning()
        : [undefined];

      if (data.nombre && usuarioId) {
        await tx.update(usuarios).set({ nombre: data.nombre }).where(eq(usuarios.id, usuarioId));
      }

      return updated;
    });
  },

  async createUsuarioForProfesor(id: number, usuario: NuevoUsuario): Promise<Profesor | undefined> {
    return await db.transaction(async (tx) => {
      const [createdUser] = await tx.insert(usuarios).values(usuario).returning();
      const [updated] = await tx
        .update(profesores)
        .set({ usuarioId: createdUser.id })
        .where(eq(profesores.id, id))
        .returning();
      return updated;
    });
  },

  async updateUsuarioForProfesor(usuarioId: number, data: Partial<Omit<NuevoUsuario, "id" | "rol">>) {
    const datosLimpios = Object.fromEntries(
      Object.entries(data).filter(([, value]) => value !== undefined)
    ) as Partial<Omit<NuevoUsuario, "id" | "rol">>;

    const [updated] = await db
      .update(usuarios)
      .set(datosLimpios)
      .where(eq(usuarios.id, usuarioId))
      .returning();
    return updated;
  },

  async deleteUsuarioForProfesor(id: number, usuarioId: number): Promise<boolean> {
    return await db.transaction(async (tx) => {
      await tx.update(profesores).set({ usuarioId: null }).where(eq(profesores.id, id));
      const [deleted] = await tx.delete(usuarios).where(eq(usuarios.id, usuarioId)).returning();
      return !!deleted;
    });
  },

  async delete(id: number): Promise<boolean> {
    const [deleted] = await db
      .delete(profesores)
      .where(eq(profesores.id, id))
      .returning();
    return !!deleted;
  },

  async deleteWithDependencias(id: number, usuarioId?: number | null): Promise<boolean> {
    return await db.transaction(async (tx) => {
      await tx.delete(disponibilidadProfesores).where(eq(disponibilidadProfesores.profesorId, id));
      await tx.delete(ofertasAsignaturas).where(eq(ofertasAsignaturas.profesorId, id));
      if (usuarioId) {
        await tx.update(profesores).set({ usuarioId: null }).where(eq(profesores.id, id));
        await tx.delete(usuarios).where(eq(usuarios.id, usuarioId));
      }
      const [deleted] = await tx.delete(profesores).where(eq(profesores.id, id)).returning();
      return !!deleted;
    });
  },
};
