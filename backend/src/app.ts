import express, { type Application } from "express";
import cors from "cors";
import { env } from "./config/env.js";
import { apiRouter } from "./routes/index.js";
import { errorHandler } from "./middlewares/error.middleware.js";

const app: Application = express();

// Middlewares
app.use(
  cors({
    origin: env.CLIENT_URL,
    credentials: true,
  })
);
app.use(express.json());

// Main API Routes
app.use("/api", apiRouter);

// Centralized error handling
app.use(errorHandler);

export { app };
