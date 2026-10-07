import { Router } from "express";
import multer from "multer";
import { horariosController } from "../controllers/horarios.controller.js";
import { validateRequest } from "../middlewares/validation.middleware.js";
import { authenticate } from "../middlewares/auth.middleware.js";
import { authorizeRoles } from "../middlewares/roles.middleware.js";
import {
  createHorarioValidation,
  updateHorarioValidation,
  horarioIdParamValidation,
  ofertaParamValidation,
  horarioQueryValidation,
  miHorarioQueryValidation,
  excelSalasQueryValidation,
} from "../validations/horarios.validation.js";

const router = Router();

// Todas las rutas requieren estar autenticado
router.use(authenticate);

// Consultar horario propio del docente autenticado (debe ir antes de /:id)
router.get(
  "/mi-horario",
  authorizeRoles("profesor", "admin"),
  validateRequest({ query: miHorarioQueryValidation }),
  horariosController.getMiHorario
);

// Consultar horarios: permitido para admin, secretaria y profesor
router.get(
  "/",
  authorizeRoles("admin", "secretaria", "profesor"),
  validateRequest({ query: horarioQueryValidation }),
  horariosController.getAll
);

// Descarga administrativa: antes de las rutas con parámetros.
router.get(
  "/excel/salas",
  authorizeRoles("admin", "secretaria"),
  validateRequest({ query: excelSalasQueryValidation }),
  horariosController.exportarExcelSalas
);

const subirExcelSalas = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024, files: 1 } }).single("archivo");
router.post(
  "/excel/salas/importar",
  authorizeRoles("admin", "secretaria"),
  (req, res, next) => {
    subirExcelSalas(req, res, (error) => {
      if (error) {
        res.status(400).json({ status: "error", errores: [{ fila: 1, columna: "archivo", mensaje: "Adjunte un único archivo en el campo archivo (máximo 10 MB)." }] });
        return;
      }
      next();
    });
  },
  horariosController.importarExcelSalas
);

router.get(
  "/:id",
  authorizeRoles("admin", "secretaria", "profesor"),
  validateRequest({ params: horarioIdParamValidation }),
  horariosController.getById
);

// Gestión y asignación de horarios: exclusivo para admin y secretaria
router.post(
  "/",
  authorizeRoles("admin", "secretaria"),
  validateRequest({ body: createHorarioValidation }),
  horariosController.create
);

router.put(
  "/:id",
  authorizeRoles("admin", "secretaria"),
  validateRequest({
    params: horarioIdParamValidation,
    body: updateHorarioValidation,
  }),
  horariosController.update
);

router.delete(
  "/:id",
  authorizeRoles("admin", "secretaria"),
  validateRequest({ params: horarioIdParamValidation }),
  horariosController.delete
);

router.delete(
  "/oferta/:ofertaId",
  authorizeRoles("admin", "secretaria"),
  validateRequest({ params: ofertaParamValidation }),
  horariosController.deleteByOferta
);

export { router as horariosRouter };
