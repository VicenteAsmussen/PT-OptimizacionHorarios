import { Router } from "express";
import multer from "multer";
import { authenticate } from "../middlewares/auth.middleware.js";
import { authorizeRoles } from "../middlewares/roles.middleware.js";
import { validateRequest } from "../middlewares/validation.middleware.js";
import { resultadosHorariosController as controlador } from "../controllers/resultados-horarios.controller.js";
import { resultadoConsulta, resultadoExportacion, resultadoMovimiento, resultadoParametros, resultadoRevision } from "../validations/resultados-horarios.validation.js";

export const resultadosHorariosRouter = Router();
resultadosHorariosRouter.use(authenticate, authorizeRoles("secretaria", "admin"));
resultadosHorariosRouter.get("/:id", validateRequest({ params: resultadoParametros, query: resultadoConsulta }), controlador.consultar);
resultadosHorariosRouter.post("/:id/validar-movimiento", validateRequest({ params: resultadoParametros, body: resultadoMovimiento }), controlador.validarMovimiento);
resultadosHorariosRouter.post("/:id/movimientos", validateRequest({ params: resultadoParametros, body: resultadoMovimiento }), controlador.mover);
resultadosHorariosRouter.get("/:id/validacion-publicacion", validateRequest({ params: resultadoParametros }), controlador.validarPublicacion);
resultadosHorariosRouter.post("/:id/publicar", validateRequest({ params: resultadoParametros, body: resultadoRevision }), controlador.publicar);
resultadosHorariosRouter.get("/:id/salas/exportar", validateRequest({ params: resultadoParametros, query: resultadoExportacion }), controlador.exportarSalas);
const subirSalas = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024, files: 1 } }).single("archivo");
resultadosHorariosRouter.post("/:id/salas/importar", (req, res, siguiente) => {
  subirSalas(req, res, error => {
    if (error) { res.status(400).json({ status: "error", message: "Adjunte un único archivo en el campo archivo (máximo 10 MB)." }); return; }
    siguiente();
  });
}, validateRequest({ params: resultadoParametros, body: resultadoRevision }), controlador.importarSalas);
