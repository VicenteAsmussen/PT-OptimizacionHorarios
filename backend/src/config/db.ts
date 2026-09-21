import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "./env.js";
import * as schema from "../db/schema/index.js";

// Database client instance using postgres.js driver
export const queryClient = postgres(env.DATABASE_URL);
export const db = drizzle(queryClient, { schema });

