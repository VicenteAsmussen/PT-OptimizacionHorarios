import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const secretoPredeterminado = "supersecret_jwt_key_change_in_production";

const envSchema = z.object({
  PORT: z.string().default("3000").refine(
    (valor) => !/[^0-9]/.test(valor) && Number(valor) >= 1 && Number(valor) <= 65535,
    "PORT debe ser un número decimal entre 1 y 65535",
  ).transform(Number),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL es obligatoria"),
  CLIENT_URL: z.string().default("http://localhost:5173"),
  JWT_SECRET: z.string().refine(
    (valor) => valor.trim().length > 0,
    "JWT_SECRET no puede estar vacío",
  ).default(secretoPredeterminado),
  JWT_EXPIRES_IN: z.string().default("7d"),
}).refine(
  (configuracion) => configuracion.NODE_ENV !== "production"
    || configuracion.JWT_SECRET.trim() !== secretoPredeterminado,
  {
    path: ["JWT_SECRET"],
    message: "JWT_SECRET debe configurarse con un valor no predeterminado en producción",
  },
);

const _env = envSchema.safeParse(process.env);

if (!_env.success) {
  console.error("Configuración de entorno inválida:", _env.error.format());
  throw new Error("Configuración de entorno inválida");
}

export const env = _env.data;
