import type { AlcanceCarrera } from "../utils/alcance-carrera.js";
import { eq, inArray } from "drizzle-orm";
import { db } from "../config/db.js";
import { departamentos, type Departamento, type NuevoDepartamento } from "../db/schema/departamentos.schema.js";

import { asignaturas } from "../db/schema/asignaturas.schema.js";
import { conCatalogosBloqueados, exigirCatalogoSinDependencias } from "./dependencias-academicas.js";

export const departamentosRepository = {
  // Detecta asignaturas que impiden retirar el departamento del catálogo.
  async hasAsignaturas(id: number): Promise<boolean> {
    const [asignatura] = await db.select({ codigo: asignaturas.codigo }).from(asignaturas).where(eq(asignaturas.departamentoId, id)).limit(1);
    return !!asignatura;
  },
  // Consulta departamentos relacionados con la carrera y sus perfiles docentes.
  async findAll(alcance?: AlcanceCarrera) {
    return await db.query.departamentos.findMany({
      where: alcance ? inArray(departamentos.id, alcance.departamentosIds) : undefined,
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

  // Recupera el departamento y sus relaciones para consulta y mantenimiento.
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

  // Detecta nombres departamentales existentes antes de crear o renombrar el registro.
  async findByNombre(nombre: string): Promise<Departamento | undefined> {
    const [result] = await db
      .select()
      .from(departamentos)
      .where(eq(departamentos.nombre, nombre))
      .limit(1);
    return result;
  },

  // Registra un departamento sin crear por sí mismo relaciones con carreras.
  async create(data: NuevoDepartamento): Promise<Departamento> {
    const [created] = await db.insert(departamentos).values(data).returning();
    return created;
  },

  // Actualiza un departamento solo después de descartar dependencias académicas bajo bloqueo.
  async update(id: number, data: Partial<Omit<NuevoDepartamento, "id">>): Promise<Departamento | undefined> {
    return conCatalogosBloqueados(async tx => {
      await exigirCatalogoSinDependencias(tx, { tipo: "departamento", id });
      const [updated] = await tx
        .update(departamentos)
        .set(data)
        .where(eq(departamentos.id, id))
        .returning();
      return updated;
    });
  },

  // Retira el departamento cuando la comprobación transaccional permite su eliminación.
  async delete(id: number): Promise<boolean> {
    return conCatalogosBloqueados(async tx => {
      await exigirCatalogoSinDependencias(tx, { tipo: "departamento", id });
      const [deleted] = await tx
        .delete(departamentos)
        .where(eq(departamentos.id, id))
        .returning();
      return !!deleted;
    });
  },
};
