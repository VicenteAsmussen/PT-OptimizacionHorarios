import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type * as esquema from "../schema/index.js";

export type BaseDatosSeed = PostgresJsDatabase<typeof esquema>;

export interface CatalogosAcademicosSeed {
  carreras: (typeof esquema.carreras.$inferSelect)[];
  departamentos: (typeof esquema.departamentos.$inferSelect)[];
}
