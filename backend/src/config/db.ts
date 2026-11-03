import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "./env.js";
import { protegerConexionEnPruebas } from "./seguridad-pruebas.js";
import * as schema from "../db/schema/index.js";

protegerConexionEnPruebas({ ...process.env, NODE_ENV: env.NODE_ENV, DATABASE_URL: env.DATABASE_URL });

// La validación ocurre antes de crear el cliente, sin reemplazar el destino configurado.
export const queryClient = postgres(env.DATABASE_URL);
export const db = drizzle(queryClient, { schema });
