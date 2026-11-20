import type { AlcanceCarrera } from "../utils/alcance-carrera.js";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "../config/db.js";
import {
  asignaturas,
  type Asignatura,
  type NuevaAsignatura,
} from "../db/schema/asignaturas.schema.js";
import { asignaturaTipoHora } from "../db/schema/asignatura-tipo-hora.schema.js";
import { carreraAsignatura } from "../db/schema/carrera-asignatura.schema.js";
import { tiposHora } from "../db/schema/tipos-hora.schema.js";
import { carreras } from "../db/schema/carreras.schema.js";
import { conCatalogosBloqueados, exigirCatalogoSinDependencias, tieneDependenciasAsignatura } from "./dependencias-academicas.js";

export interface TipoHoraItem {
  tipoHoraId: number;
  horas: number;
}

export const asignaturasRepository = {
  // Carga asignaturas, mallas y componentes con un indicador de uso académico.
  async findAll(alcance?: AlcanceCarrera, departamentoId?: number) {
    const materias = await db.query.asignaturas.findMany({
      where: and(
        alcance ? inArray(asignaturas.codigo, alcance.asignaturasCodigos) : undefined,
        departamentoId !== undefined ? eq(asignaturas.departamentoId, departamentoId) : undefined,
      ),
      with: {
        departamento: true,
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
    return Promise.all(materias.map(async materia => ({ ...materia,
      tieneDependenciasAcademicas: await tieneDependenciasAsignatura(db, materia.codigo),
    })));
  },

  // Recupera la definición de una asignatura y las relaciones que condicionan su mantenimiento.
  async findByCodigo(codigo: string) {
    const materia = await db.query.asignaturas.findFirst({
      where: eq(asignaturas.codigo, codigo),
      with: {
        departamento: true,
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
    return materia ? { ...materia, tieneDependenciasAcademicas: await tieneDependenciasAsignatura(db, codigo) } : undefined;
  },

  // Identifica los tipos de hora válidos entre los componentes que se quieren registrar.
  async findExistingTiposHoraIds(ids: number[]): Promise<number[]> {
    if (ids.length === 0) return [];
    const results = await db
      .select({ id: tiposHora.id })
      .from(tiposHora)
      .where(inArray(tiposHora.id, ids));
    return results.map((r) => r.id);
  },

  // Identifica las carreras existentes antes de asociar la asignatura a sus mallas.
  async findExistingCarrerasIds(ids: number[]): Promise<number[]> {
    if (ids.length === 0) return [];
    const results = await db
      .select({ id: carreras.id })
      .from(carreras)
      .where(inArray(carreras.id, ids));
    return results.map((r) => r.id);
  },

  // Inserta asignatura, componentes y vínculos de malla en una sola transacción.
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

  // Reemplaza las relaciones indicadas solo si la asignatura no tiene dependencias académicas.
  async update(
    codigo: string,
    data: Partial<Omit<NuevaAsignatura, "codigo">>,
    tiposHoraList?: TipoHoraItem[],
    carrerasIds?: number[]
  ) {
    return conCatalogosBloqueados(async (tx) => {
      await exigirCatalogoSinDependencias(tx, { tipo: "asignatura", codigo });
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
          departamento: true,
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

  // Elimina la asignatura únicamente después de comprobar su falta de uso académico bajo bloqueo.
  async delete(codigo: string): Promise<boolean> {
    return conCatalogosBloqueados(async tx => {
      await exigirCatalogoSinDependencias(tx, { tipo: "asignatura", codigo });
      const [deleted] = await tx
        .delete(asignaturas)
        .where(eq(asignaturas.codigo, codigo))
        .returning();
      return !!deleted;
    });
  },
};
