import { Router } from "express";
import { healthRouter } from "./health.routes.js";

const apiRouter = Router();

// Base routes
apiRouter.use("/health", healthRouter);

export { apiRouter };
