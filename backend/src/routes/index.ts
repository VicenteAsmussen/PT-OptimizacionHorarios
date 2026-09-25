import { Router } from "express";
import { healthRouter } from "./health.routes.js";
import { asignaturasRouter } from "./asignaturas.routes.js";
import { salasRouter } from "./salas.routes.js";
import { semestresRouter } from "./semestres.routes.js";
import { departamentosRouter } from "./departamentos.routes.js";
import { carrerasRouter } from "./carreras.routes.js";
import { usuariosRouter } from "./usuarios.routes.js";
import { profesoresRouter } from "./profesores.routes.js";
import { disponibilidadRouter } from "./disponibilidad.routes.js";

const apiRouter = Router();

// Base routes
apiRouter.use("/health", healthRouter);
apiRouter.use("/asignaturas", asignaturasRouter);
apiRouter.use("/salas", salasRouter);
apiRouter.use("/semestres", semestresRouter);
apiRouter.use("/departamentos", departamentosRouter);
apiRouter.use("/carreras", carrerasRouter);
apiRouter.use("/usuarios", usuariosRouter);
apiRouter.use("/profesores", profesoresRouter);
apiRouter.use("/disponibilidad-profesores", disponibilidadRouter);

export { apiRouter };
