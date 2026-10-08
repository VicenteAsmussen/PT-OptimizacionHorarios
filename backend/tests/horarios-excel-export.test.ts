import { beforeEach, describe, expect, it, vi } from "vitest";
import ExcelJS from "exceljs";
import express, { type Request, type Response, type NextFunction } from "express";
import request from "supertest";
import { horariosRouter } from "../src/routes/horarios.routes.js";
import { horariosRepository } from "../src/repositories/horarios.repository.js";
import { horariosService } from "../src/services/horarios.service.js";
import { excelSalasQueryValidation } from "../src/validations/horarios.validation.js";
import { encabezadosExcelSalas } from "../src/utils/excel-salas.js";
import { BadRequestError, NotFoundError } from "../src/utils/errors.js";

vi.mock("../src/repositories/horarios.repository.js", () => ({
  horariosRepository: { findParaExportarSalas: vi.fn(), findSemestreById: vi.fn() },
}));

vi.mock("../src/middlewares/auth.middleware.js", () => ({
  authenticate: (req: Request, res: Response, next: NextFunction) => {
    const rol = req.header("x-rol-prueba");
    if (!rol) { res.sendStatus(401); return; }
    req.user = { id: 1, rol } as Request["user"];
    next();
  },
}));

const aplicacion = express();
aplicacion.use("/api/horarios-asignaturas", horariosRouter);
aplicacion.use((error: { statusCode?: number }, _req: Request, res: Response, _next: NextFunction) => {
  res.sendStatus(error.statusCode ?? 500);
});

type EntradaExportacion = Awaited<ReturnType<typeof horariosRepository.findParaExportarSalas>>[number];
function entrada(dia = "Lunes", numeroBloque = 1, horaInicio = "08:10", horaTermino = "08:50", tipo = "Teórica"): EntradaExportacion {
  return {
    oferta: {
      seccion: 2, profesorId: 7, profesor: { nombre: "Ana Pérez" },
      asignatura: { codigo: "INF100", nombre: "Programación", semestreMalla: 3,
        tiposHora: [{ horas: 4, tipoHora: { tipo: "Teórica" } }, { horas: 2, tipoHora: { tipo: "Práctica" } }, { horas: 1, tipoHora: { tipo: "Laboratorio" } }] },
    },
    bloque: { dia, numeroBloque, horaInicio, horaTermino },
    tipoHora: { tipo }, sala: { codigo: "101-AA" },
  } as EntradaExportacion;
}

async function leerLibro() {
  const resultado = await horariosService.exportarExcelSalas(9);
  expect(Buffer.isBuffer(resultado.buffer)).toBe(true);
  expect(resultado.nombreArchivo).toBe("Resumen Malla (2026-1).xlsx");
  const libro = new ExcelJS.Workbook();
  await libro.xlsx.load(resultado.buffer);
  return libro;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(horariosRepository.findSemestreById).mockResolvedValue({ codigo: "2026-1" });
});
describe("Exportación Excel de asignación de salas", () => {
  it("genera una hoja visible, encabezados y datos de malla, con todas las salas vacías", async () => {
    vi.mocked(horariosRepository.findParaExportarSalas).mockResolvedValue([entrada()]);
    const libro = await leerLibro();
    expect(horariosRepository.findSemestreById).toHaveBeenCalledWith(9);
    expect(horariosRepository.findParaExportarSalas).toHaveBeenCalledWith(9);
    expect(libro.worksheets).toHaveLength(1);
    const hoja = libro.worksheets[0]!;
    expect(hoja.name).toBe("Resumen Malla");
    expect(hoja.state).toBe("visible");
    expect(hoja.getRow(1).values).toEqual([undefined, ...encabezadosExcelSalas]);
    expect(hoja.getRow(1).hidden).toBe(false);
    expect(hoja.getRow(2).values.slice(1, 9)).toEqual(["INF100", 3, 2, "Programación", 4, 2, 1, "Ana Pérez"]);
    for (const columna of [11, 14, 17, 20, 23]) expect(hoja.getRow(2).getCell(columna).value ?? "").toBe("");
  });

  it.each(["Laboratorio", "LABORATÓRIO", "laboratory", " LABORATORY "])("excluye %s", async (tipo) => {
    vi.mocked(horariosRepository.findParaExportarSalas).mockResolvedValue([entrada(), entrada("Martes", 1, "08:10", "08:50", tipo)]);
    const hoja = (await leerLibro()).worksheets[0]!;
    expect(hoja.rowCount).toBe(2);
    expect(hoja.getRow(2).getCell(12).value ?? "").toBe("");
  });

  it("agrupa adyacencia y pausa institucional de diez minutos, ordenando bloques", async () => {
    vi.mocked(horariosRepository.findParaExportarSalas).mockResolvedValue([
      entrada("Lunes", 3, "09:40", "10:20"), entrada(), entrada("Lunes", 2, "08:50", "09:30"),
      entrada("Martes"),
    ]);
    const hoja = (await leerLibro()).worksheets[0]!;
    expect(hoja.rowCount).toBe(2);
    expect(hoja.getRow(2).getCell(9).value).toBe("Lunes");
    expect(hoja.getRow(2).getCell(10).value).toBe("08:10-10:20");
    expect(hoja.getRow(2).getCell(12).value).toBe("Martes");
  });

  it("separa profesores, secciones y tipos de hora", async () => {
    const otraSeccion = entrada(); otraSeccion.oferta.seccion = 3;
    const otroProfesor = entrada(); otroProfesor.oferta.profesorId = 8;
    vi.mocked(horariosRepository.findParaExportarSalas).mockResolvedValue([
      entrada(), otraSeccion, otroProfesor, entrada("Martes", 1, "08:10", "08:50", "Práctica"),
    ]);
    expect((await leerLibro()).worksheets[0]!.rowCount).toBe(5);
  });

  it("rechaza más de cinco sesiones sin truncar, con mensaje accionable", async () => {
    vi.mocked(horariosRepository.findParaExportarSalas).mockResolvedValue(
      ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"].map((dia) => entrada(dia))
    );
    await expect(horariosService.exportarExcelSalas(9)).rejects.toBeInstanceOf(BadRequestError);
    await expect(horariosService.exportarExcelSalas(9)).rejects.toThrow(/INF100.*sección 2.*6 sesiones.*máximo.*5.*Revise/);
  });

  it("usa el código del semestre seleccionado, no su ID", async () => {
    vi.mocked(horariosRepository.findSemestreById).mockResolvedValue({ codigo: "2027-2" });
    vi.mocked(horariosRepository.findParaExportarSalas).mockResolvedValue([entrada()]);
    expect((await horariosService.exportarExcelSalas(42)).nombreArchivo).toBe("Resumen Malla (2027-2).xlsx");
    expect(horariosRepository.findSemestreById).toHaveBeenCalledWith(42);
  });

  it("rechaza un semestre inexistente antes de consultar horarios", async () => {
    vi.mocked(horariosRepository.findSemestreById).mockResolvedValue(undefined);
    await expect(horariosService.exportarExcelSalas(9)).rejects.toBeInstanceOf(NotFoundError);
    await expect(horariosService.exportarExcelSalas(9)).rejects.toThrow("Semestre con ID 9 no encontrado");
    expect(horariosRepository.findParaExportarSalas).not.toHaveBeenCalled();
  });

  it("responde HTTP 404 para un semestre inexistente", async () => {
    vi.mocked(horariosRepository.findSemestreById).mockResolvedValue(undefined);
    const respuesta = await request(aplicacion).get("/api/horarios-asignaturas/excel/salas?semestreId=9")
      .set("x-rol-prueba", "secretaria");
    expect(respuesta.status).toBe(404);
    expect(respuesta.headers["content-disposition"]).toBeUndefined();
    expect(horariosRepository.findParaExportarSalas).not.toHaveBeenCalled();
  });

  it.each([
    { caso: "sin horarios", entradas: [] },
    { caso: "solo con laboratorios", entradas: ["Laboratorio", "LABORATÓRIO", "laboratory", " LABORATORY "].map((tipo) => entrada("Lunes", 1, "08:10", "08:50", tipo)) },
  ])("rechaza un semestre $caso con error de dominio y HTTP 400", async ({ entradas }) => {
    vi.mocked(horariosRepository.findParaExportarSalas).mockResolvedValue(entradas);
    await expect(horariosService.exportarExcelSalas(9)).rejects.toBeInstanceOf(BadRequestError);
    await expect(horariosService.exportarExcelSalas(9)).rejects.toThrow("No hay horarios generados para este semestre que se puedan exportar (se excluyen laboratorios).");
    const respuesta = await request(aplicacion).get("/api/horarios-asignaturas/excel/salas?semestreId=9")
      .set("x-rol-prueba", "secretaria");
    expect(respuesta.status).toBe(400);
    expect(respuesta.headers["content-disposition"]).toBeUndefined();
  });

  it.each(["admin", "secretaria"])("descarga HTTP para %s con cabeceras de adjunto", async (rol) => {
    vi.mocked(horariosRepository.findParaExportarSalas).mockResolvedValue([entrada()]);
    const respuesta = await request(aplicacion).get("/api/horarios-asignaturas/excel/salas?semestreId=9")
      .set("x-rol-prueba", rol).buffer(true).parse((respuestaBinaria, terminar) => {
        const fragmentos: Buffer[] = [];
        respuestaBinaria.on("data", (fragmento: Buffer) => fragmentos.push(fragmento));
        respuestaBinaria.on("end", () => terminar(null, Buffer.concat(fragmentos)));
        respuestaBinaria.on("error", terminar);
      });
    expect(respuesta.status).toBe(200);
    expect(respuesta.headers["content-type"]).toBe("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    expect(respuesta.headers["content-disposition"]).toBe('attachment; filename="Resumen Malla (2026-1).xlsx"');
    expect(Buffer.isBuffer(respuesta.body)).toBe(true);
    const libro = new ExcelJS.Workbook();
    await libro.xlsx.load(respuesta.body);
    expect(libro.worksheets[0]!.name).toBe("Resumen Malla");
  });

  it("rechaza profesor y solicitudes sin autenticación antes de consultar", async () => {
    expect((await request(aplicacion).get("/api/horarios-asignaturas/excel/salas?semestreId=9")).status).toBe(401);
    expect((await request(aplicacion).get("/api/horarios-asignaturas/excel/salas?semestreId=9")
      .set("x-rol-prueba", "profesor")).status).toBe(403);
    expect(horariosRepository.findParaExportarSalas).not.toHaveBeenCalled();
  });

  it("rechaza la consulta HTTP inválida antes de consultar", async () => {
    const respuesta = await request(aplicacion).get("/api/horarios-asignaturas/excel/salas?semestreId=0")
      .set("x-rol-prueba", "secretaria");
    expect(respuesta.status).toBe(400);
    expect(horariosRepository.findParaExportarSalas).not.toHaveBeenCalled();
  });

  it("requiere semestreId entero positivo", () => {
    expect(excelSalasQueryValidation.parse({ semestreId: "9" })).toEqual({ semestreId: 9 });
    for (const semestreId of [undefined, "", "0", "-1", "1.5", "abc"]) {
      expect(excelSalasQueryValidation.safeParse({ semestreId }).success).toBe(false);
    }
  });
});
