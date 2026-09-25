import { eq, inArray } from "drizzle-orm";
import { db } from "../config/db.js";
import {
  asignaturas,
  asignaturaTipoHora,
  carreraAsignatura,
  type Asignatura,
  type NuevaAsignatura,
} from "../db/schema/asignaturas.schema.js";
import { tiposHora } from "../db/schema/recursos.schema.js";
import { carreras } from "../db/schema/departamentos.schema.js";

export interface TipoHoraItem {
  tipoHoraId: number;
  horas: number;
}

export const asignaturasRepository = {
  async findAll() {
    return await db.query.asignaturas.findMany({
      with: {
        tiposHora: {
          with: {
            tipoHora: true,
          },
        },
        carreraAsignaturas: {
          with: {
            carrera: true,
          },
        },
      },
    });
  },

  async findByCodigo(codigo: string) {
    return await db.query.asignaturas.findFirst({
      where: eq(asignaturas.codigo, codigo),
      with: {
        tiposHora: {
          with: {
            tipoHora: true,
          },
        },
        carreraAsignaturas: {
          with: {
            carrera: true,
          },
        },
      },
    });
  },

  async findExistingTiposHoraIds(ids: number[]): Promise<number[]> {
    if (ids.length === 0) return [];
    const results = await db
      .select({ id: tiposHora.id })
      .from(tiposHora)
      .where(inArray(tiposHora.id, ids));
    return results.map((r) => r.id);
  },

  async findExistingCarrerasIds(ids: number[]): Promise<number[]> {
    if (ids.length === 0) return [];
    const results = await db
      .select({ id: carreras.id })
      .from(carreras)
      .where(inArray(carreras.id, ids));
    return results.map((r) => r.id);
  },

  async create(
    data: NuevaAsignatura,
    tiposHoraList: TipoHoraItem[] = [],
    carrerasIds: number[] = []
  ): Promise<Asignatura> {
    return await db.transaction(async (tx) => {
      const [created] = await tx.insert(asignaturas).values(data).returning();

      if (tiposHoraList.length > 0) {
        await tx.insert(asignaturaTipoHora).values(
          tiposHoraList.map((item) => ({
            asignaturaCodigo: created.codigo,
            tipoHoraId: item.tipoHoraId,
            horas: item.horas,
          }))
        );
      }

      if (carrerasIds.length > 0) {
        await tx.insert(carreraAsignatura).values(
          carrerasIds.map((carreraId) => ({
            carreraId,
            asignaturaCodigo: created.codigo,
          }))
        );
      }

      return created;
    });
  },

  async update(
    codigo: string,
    data: Partial<Omit<NuevaAsignatura, "codigo">>,
    tiposHoraList?: TipoHoraItem[],
    carrerasIds?: number[]
  ) {
    return await db.transaction(async (tx) => {
      if (Object.keys(data).length > 0) {
        await tx
          .update(asignaturas)
          .set(data)
          .where(eq(asignaturas.codigo, codigo));
      }

      if (tiposHoraList !== undefined) {
        await tx
          .delete(asignaturaTipoHora)
          .where(eq(asignaturaTipoHora.asignaturaCodigo, codigo));

        if (tiposHoraList.length > 0) {
          await tx.insert(asignaturaTipoHora).values(
            tiposHoraList.map((item) => ({
              asignaturaCodigo: codigo,
              tipoHoraId: item.tipoHoraId,
              horas: item.horas,
            }))
          );
        }
      }

      if (carrerasIds !== undefined) {
        await tx
          .delete(carreraAsignatura)
          .where(eq(carreraAsignatura.asignaturaCodigo, codigo));

        if (carrerasIds.length > 0) {
          await tx.insert(carreraAsignatura).values(
            carrerasIds.map((carreraId) => ({
              carreraId,
              asignaturaCodigo: codigo,
            }))
          );
        }
      }

      return await tx.query.asignaturas.findFirst({
        where: eq(asignaturas.codigo, codigo),
        with: {
          tiposHora: {
            with: {
              tipoHora: true,
            },
          },
          carreraAsignaturas: {
            with: {
              carrera: true,
            },
          },
        },
      });
    });
  },

  async delete(codigo: string): Promise<boolean> {
    const [deleted] = await db
      .delete(asignaturas)
      .where(eq(asignaturas.codigo, codigo))
      .returning();
    return !!deleted;
  },
};
