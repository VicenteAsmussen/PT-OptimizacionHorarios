import dotenv from "dotenv";
import { z } from "zod";
import jwt, { type SignOptions } from "jsonwebtoken";

dotenv.config();

const secretoPredeterminado = "supersecret_jwt_key_change_in_production";

function esOrigenHttp(valor: string): boolean {
  try {
    const url = new URL(valor);
    return ["http:", "https:"].includes(url.protocol) && valor === url.origin;
  } catch {
    return false;
  }
}

function esDuracionValida(valor: string): boolean {
  try {
    // Usar el mismo intérprete que los tokens, sin cuentas ni secretos reales.
    const token = jwt.sign({ iat: 1 }, "validacion-sintetica-de-duracion", {
      algorithm: "HS256", expiresIn: valor as SignOptions["expiresIn"],
    });
    const datos = jwt.decode(token);
    return datos !== null && typeof datos !== "string"
      && Number.isSafeInteger(datos.exp) && datos.exp! > 1;
  } catch {
    return false;
  }
}

const envSchema = z.object({
  PORT: z.string().default("3000").refine(
    (valor) => !/[^0-9]/.test(valor) && Number(valor) >= 1 && Number(valor) <= 65535,
    "PORT debe ser un número decimal entre 1 y 65535",
  ).transform(Number),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  DATABASE_URL: z.string().refine((valor) => valor.trim().length > 0, "DATABASE_URL es obligatoria"),
  CLIENT_URL: z.string().refine(esOrigenHttp,
    "CLIENT_URL debe ser un origen HTTP o HTTPS sin credenciales, ruta, consulta ni fragmento").optional(),
  JWT_SECRET: z.string().refine(
    (valor) => valor.trim().length > 0,
    "JWT_SECRET no puede estar vacío",
  ).default(secretoPredeterminado),
  JWT_EXPIRES_IN: z.string().refine(esDuracionValida,
    "JWT_EXPIRES_IN debe ser una duración válida de al menos un segundo").default("8h"),
}).refine(
  (configuracion) => configuracion.NODE_ENV !== "production"
    || configuracion.JWT_SECRET.trim() !== secretoPredeterminado,
  {
    path: ["JWT_SECRET"],
    message: "JWT_SECRET debe configurarse con un valor no predeterminado en producción",
  },
).refine(
  (configuracion) => configuracion.NODE_ENV !== "production"
    || configuracion.JWT_SECRET.trim().length === 0
    || configuracion.JWT_SECRET.trim() === secretoPredeterminado
    || Buffer.byteLength(configuracion.JWT_SECRET.trim(), "utf8") >= 32,
  {
    path: ["JWT_SECRET"],
    message: "JWT_SECRET debe contener al menos 32 bytes sin contar espacios exteriores en producción",
  },
).refine(
  (configuracion) => configuracion.NODE_ENV !== "production" || configuracion.CLIENT_URL !== undefined,
  { path: ["CLIENT_URL"], message: "CLIENT_URL debe configurarse explícitamente en producción" },
).transform((configuracion) => ({ ...configuracion, CLIENT_URL: configuracion.CLIENT_URL ?? "http://localhost:5173" }));

const _env = envSchema.safeParse(process.env);

if (!_env.success) {
  console.error("Configuración de entorno inválida:", _env.error.format());
  throw new Error("Configuración de entorno inválida");
}

export const env = _env.data;
