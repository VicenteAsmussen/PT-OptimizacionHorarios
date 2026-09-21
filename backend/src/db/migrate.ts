import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { env } from "../config/env.js";

async function runMigrate() {
  const connection = postgres(env.DATABASE_URL, { max: 1 });
  const db = drizzle(connection);
  console.log("Applying migrations to:", env.DATABASE_URL);
  await migrate(db, { migrationsFolder: "./src/db/migrations" });
  console.log("Migrations applied successfully!");
  await connection.end();
  process.exit(0);
}

runMigrate().catch((err) => {
  console.error("Migration error:", err);
  process.exit(1);
});
