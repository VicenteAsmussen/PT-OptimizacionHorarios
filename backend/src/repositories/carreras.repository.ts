import { eq, inArray } from "drizzle-orm";
import { db } from "../config/db.js";
import {
  carreras,
  type Carrera,
  type NuevaCarrera,
} from "../db/schema/carreras.schema.js";
import { carreraDepartamento } from "../db/schema/carrera-departamento.schema.js";
import { departamentos } from "../db/schema/departamentos.schema.js";
import { secretarias } from "../db/schema/secretarias.schema.js";
import { carreraAsignatura } from "../db/schema/carrera-asignatura.schema.js";
import { profesores } from "../db/schema/profesores.schema.js";
import { ofertasAsignaturas } from "../db/schema/ofertas-asignaturas.schema.js";
import type { AlcanceCarrera } from "../utils/alcance-carrera.js";

type RelacionDepartamentoInput = {
  departamentoId: number;
  esGestionado: boolean;
};

export const carrerasRepository = {
  async findAlcanceByUsuarioId(usuarioId: number): Promise<AlcanceCarrera | undefined> {
    const [perfil] = await db.select({ carreraId: secretarias.carreraId }).from(secretarias)
      .where(eq(secretarias.usuarioId, usuarioId)).limit(1);
    if (!perfil) return undefined;
    const { carreraId } = perfil;
    const asignaciones = await db.select({ codigo: carreraAsignatura.asignaturaCodigo }).from(carreraAsignatura)
      .where(eq(carreraAsignatura.carreraId, carreraId));
    // No filtrar esGestionado para el alcance: tanto departamentos propios como externos están relacionados con la carrera.
    // La gestión operativa se expone aparte para permisos de acceso/disponibilidad.
    const relaciones = await db.select({
      id: carreraDepartamento.departamentoId,
      esGestionado: carreraDepartamento.esGestionado,
    }).from(carreraDepartamento)
      .where(eq(carreraDepartamento.carreraId, carreraId));
    const asignaturasCodigos = asignaciones.map((asignacion) => asignacion.codigo);
    const departamentosIds = relaciones.map((relacion) => relacion.id);
    const departamentosGestionadosIds = relaciones
      .filter((relacion) => relacion.esGestionado)
      .map((relacion) => relacion.id);
    const docentes = departamentosIds.length ? await db.select({ id: profesores.id }).from(profesores)
      .where(inArray(profesores.departamentoId, departamentosIds)) : [];
    const ofertas = asignaturasCodigos.length ? await db.select({ id: ofertasAsignaturas.id }).from(ofertasAsignaturas)
      .where(inArray(ofertasAsignaturas.asignaturaCodigo, asignaturasCodigos)) : [];
    return { carreraId, asignaturasCodigos, departamentosIds, departamentosGestionadosIds,
      profesoresIds: docentes.map((docente) => docente.id), ofertasIds: ofertas.map((oferta) => oferta.id) };
  },

  async findAll(alcance?: AlcanceCarrera) {
    return await db.query.carreras.findMany({
      where: alcance ? eq(carreras.id, alcance.carreraId) : undefined,
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

  async create(data: NuevaCarrera, departamentos: RelacionDepartamentoInput[] = []): Promise<Carrera> {
    return await db.transaction(async (tx) => {
      const [created] = await tx.insert(carreras).values(data).returning();

      if (departamentos.length > 0) {
        await tx.insert(carreraDepartamento).values(
          departamentos.map((departamento) => ({
            carreraId: created.id,
            departamentoId: departamento.departamentoId,
            esGestionado: departamento.esGestionado,
          }))
        );
      }

      return created;
    });
  },

  async update(
    id: number,
    data: Partial<Omit<NuevaCarrera, "id">>,
    departamentos?: RelacionDepartamentoInput[]
  ) {
    return await db.transaction(async (tx) => {
      if (Object.keys(data).length > 0) {
        await tx.update(carreras).set(data).where(eq(carreras.id, id));
      }

      if (departamentos !== undefined) {
        await tx
          .delete(carreraDepartamento)
          .where(eq(carreraDepartamento.carreraId, id));

        if (departamentos.length > 0) {
          await tx.insert(carreraDepartamento).values(
            departamentos.map((departamento) => ({
              carreraId: id,
              departamentoId: departamento.departamentoId,
              esGestionado: departamento.esGestionado,
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
