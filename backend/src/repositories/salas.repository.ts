import { eq } from "drizzle-orm";
import { db } from "../config/db.js";
import { salas, type Sala, type NuevaSala } from "../db/schema/salas.schema.js";
import { conCatalogosBloqueados, exigirCatalogoSinDependencias } from "./dependencias-academicas.js";

export const salasRepository = {
  // Consulta el catálogo físico, distinto del presupuesto de recursos de cada ejecución.
  async findAll(): Promise<Sala[]> {
    return await db.select().from(salas);
  },

  // Recupera la sala física indicada para consulta o validación de un horario.
  async findById(id: number): Promise<Sala | undefined> {
    const [result] = await db.select().from(salas).where(eq(salas.id, id)).limit(1);
    return result;
  },

  // Detecta nombres de sala ya registrados antes del mantenimiento del catálogo.
  async findByNombre(nombre: string): Promise<Sala | undefined> {
    const [result] = await db.select().from(salas).where(eq(salas.nombre, nombre)).limit(1);
    return result;
  },

  // Incorpora una sala física al catálogo sin reservarla para ningún período.
  async create(data: NuevaSala): Promise<Sala> {
    const [created] = await db.insert(salas).values(data).returning();
    return created;
  },

  // Modifica la sala únicamente si no está utilizada por horarios, con comprobación bajo bloqueo.
  async update(id: number, data: Partial<Omit<NuevaSala, "id">>): Promise<Sala | undefined> {
    return conCatalogosBloqueados(async tx => {
      await exigirCatalogoSinDependencias(tx, { tipo: "sala", id });
      const [updated] = await tx
        .update(salas)
        .set(data)
        .where(eq(salas.id, id))
        .returning();
      return updated;
    });
  },

  // Elimina del catálogo una sala sin dependencias académicas detectadas en la transacción.
  async delete(id: number): Promise<boolean> {
    return conCatalogosBloqueados(async tx => {
      await exigirCatalogoSinDependencias(tx, { tipo: "sala", id });
      const [deleted] = await tx.delete(salas).where(eq(salas.id, id)).returning();
      return !!deleted;
    });
  },
};
