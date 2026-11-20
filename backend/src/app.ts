import express, { type Application } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { env } from "./config/env.js";
import { apiRouter } from "./routes/index.js";
import { errorHandler } from "./middlewares/error.middleware.js";

const app: Application = express();

// Preparación de las solicitudes
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

// Manejo centralizado de errores
app.use(errorHandler);

export { app };
