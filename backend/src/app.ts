import express, { type Application } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { env } from "./config/env.js";
import { apiRouter } from "./routes/index.js";
import { errorHandler } from "./middlewares/error.middleware.js";
import { protegerCsrf } from "./middlewares/csrf.middleware.js";
import { montarFrontend } from "./config/frontend.js";

const app: Application = express();

// Preparación de las solicitudes
app.use("/api", protegerCsrf);
app.use(
  cors({
    origin: env.CLIENT_URL,
    credentials: true,
  })
);
app.use(express.json());
app.use(cookieParser());

// Rutas principales de la API
app.use("/api", apiRouter);
// Una API desconocida nunca debe devolver el HTML de la aplicación.
app.use("/api", (_peticion, respuesta) => {
  respuesta.status(404).json({ status: "error", statusCode: 404, message: "Ruta de API no encontrada." });
});
if (env.NODE_ENV === "production") montarFrontend(app);

// Manejo centralizado de errores
app.use(errorHandler);

export { app };
