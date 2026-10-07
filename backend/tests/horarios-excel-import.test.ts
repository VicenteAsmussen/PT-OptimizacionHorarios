import { beforeEach, describe, expect, it, vi } from "vitest";
import ExcelJS from "exceljs";
import express, { type Request, type Response, type NextFunction } from "express";
import request from "supertest";
import { horariosRouter } from "../src/routes/horarios.routes.js";
import { horariosRepository } from "../src/repositories/horarios.repository.js";
import { horariosService } from "../src/services/horarios.service.js";
import { encabezadosExcelSalas } from "../src/utils/excel-salas.js";
vi.mock("../src/repositories/horarios.repository.js", () => ({ horariosRepository: {
  findParaImportarSalas: vi.fn(), actualizarSalasEnTransaccion: vi.fn(),
} }));
vi.mock("../src/middlewares/auth.middleware.js", () => ({ authenticate: (req: Request, res: Response, next: NextFunction) => {
  const rol = req.header("x-rol-prueba");
  if (!rol) { res.sendStatus(401); return; }
  req.user = { id: 1, rol } as Request["user"]; next();
} }));
const aplicacion = express();
aplicacion.use("/horarios", horariosRouter);
aplicacion.use((error: { statusCode?: number }, _req: Request, res: Response, _next: NextFunction) => res.sendStatus(error.statusCode ?? 500));
function entrada(id = 1, codigo = "INF100", salaId: number | null = null) {
  return { id, ofertaId: id, bloqueId: 10, salaId, semestreId: 9, tipoHoraId: 1,
    oferta: { seccion: 2, profesorId: 7, profesor: { nombre: "Ana Pérez" },
      asignatura: { codigo, nombre: "Programación", semestreMalla: 3 } },
    bloque: { dia: "Lunes", numeroBloque: 1, horaInicio: "08:10", horaTermino: "08:50" }, tipoHora: { tipo: "Teórica" } };
}
const fila = () => ["INF100", 3, 2, "Programación", 4, 0, 0, "Ana Pérez", "Lunes", "08:10-08:50", "101AA"];
async function archivo(filas: (string | number)[][] = [fila()], encabezados: readonly string[] = encabezadosExcelSalas) {
  const libro = new ExcelJS.Workbook(); const hoja = libro.addWorksheet("Asignación Salas");
  hoja.addRow([...encabezados]); filas.forEach((datos) => hoja.addRow(datos));
  return Buffer.from(await libro.xlsx.writeBuffer());
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(horariosRepository.findParaImportarSalas).mockResolvedValue({ entradas: [entrada()], salas: [{ id: 4, nombre: "101-AA" }] } as never);
});
describe("Importación Excel todo-o-nada", () => {
  it("normaliza sala y aplica un único lote", async () => {
    expect(await horariosService.importarExcelSalas(9, await archivo())).toEqual({ actualizadas: 1, pendientes: 0, errores: [] });
    expect(horariosRepository.actualizarSalasEnTransaccion).toHaveBeenCalledExactlyOnceWith(9, [{ id: 1, salaId: 4 }]);
  });
  it("sala vacía borra la asignación y cuenta la sesión pendiente", async () => {
    const datos = fila(); datos[10] = "";
    vi.mocked(horariosRepository.findParaImportarSalas).mockResolvedValue({ entradas: [entrada(1, "INF100", 4)], salas: [{ id: 4, nombre: "101-AA" }] } as never);
    expect(await horariosService.importarExcelSalas(9, await archivo([datos]))).toEqual({ actualizadas: 0, pendientes: 1, errores: [] });
    expect(horariosRepository.actualizarSalasEnTransaccion).toHaveBeenCalledWith(9, [{ id: 1, salaId: null }]);
  });
  it.each([[8, "Funday", "Día 1"], [9, "25:00-26:00", "Horario 1"], [3, "Otra", "Nombre Asignatura"], [7, "Otro", "Profesor"], [10, "999", "Sala 1"], [0, "XYZ", "Código Asig."]])("reporta error accionable en columna %s sin actualizar", async (indice, valor, columna) => {
    const datos = fila(); datos[Number(indice)] = valor;
    const resultado = await horariosService.importarExcelSalas(9, await archivo([datos]));
    expect(resultado.errores).toEqual(expect.arrayContaining([expect.objectContaining({ fila: 2, columna, mensaje: expect.any(String) })]));
    expect(horariosRepository.actualizarSalasEnTransaccion).not.toHaveBeenCalled();
  });
  it("rechaza encabezado incorrecto", async () => {
    const encabezados = [...encabezadosExcelSalas]; encabezados[0] = "Código" as never;
    const resultado = await horariosService.importarExcelSalas(9, await archivo([fila()], encabezados));
    expect(resultado.errores[0]).toMatchObject({ fila: 1, columna: "Código Asig." });
    expect(horariosRepository.actualizarSalasEnTransaccion).not.toHaveBeenCalled();
  });
  it("colecciona errores y no aplica siquiera filas válidas", async () => {
    const datos = fila(); datos[8] = "Inválido"; datos[9] = "Inválido";
    const resultado = await horariosService.importarExcelSalas(9, await archivo([fila(), datos]));
    expect(resultado.errores.length).toBeGreaterThanOrEqual(2);
    expect(horariosRepository.actualizarSalasEnTransaccion).not.toHaveBeenCalled();
  });
  it("detecta conflicto con sesión no incluida, incluso laboratorio", async () => {
    const otra = entrada(2, "INF200", 4); otra.tipoHora.tipo = "Laboratorio";
    vi.mocked(horariosRepository.findParaImportarSalas).mockResolvedValue({ entradas: [entrada(), otra], salas: [{ id: 4, nombre: "101-AA" }] } as never);
    const resultado = await horariosService.importarExcelSalas(9, await archivo());
    expect(resultado.errores).toEqual(expect.arrayContaining([expect.objectContaining({ fila: 2, columna: "Sala 1", mensaje: expect.stringMatching(/ocupada|conflicto/i) })]));
    expect(horariosRepository.actualizarSalasEnTransaccion).not.toHaveBeenCalled();
  });
  it("detecta conflicto entre dos sesiones del archivo", async () => {
    vi.mocked(horariosRepository.findParaImportarSalas).mockResolvedValue({ entradas: [entrada(), entrada(2, "INF200")], salas: [{ id: 4, nombre: "101-AA" }] } as never);
    const otra = fila(); otra[0] = "INF200";
    expect((await horariosService.importarExcelSalas(9, await archivo([fila(), otra]))).errores.length).toBeGreaterThan(0);
    expect(horariosRepository.actualizarSalasEnTransaccion).not.toHaveBeenCalled();
  });
  it("rechaza archivo ilegible y sesiones duplicadas", async () => {
    expect((await horariosService.importarExcelSalas(9, Buffer.from("no excel"))).errores[0]).toMatchObject({ columna: "archivo" });
    expect((await horariosService.importarExcelSalas(9, await archivo([fila(), fila()]))).errores.length).toBeGreaterThan(0);
    expect(horariosRepository.actualizarSalasEnTransaccion).not.toHaveBeenCalled();
  });
  it("actualiza todos los bloques de una sesión y procesa el quinto slot", async () => {
    const segundo = entrada(2); segundo.ofertaId = 1; segundo.bloqueId = 11;
    segundo.bloque = { dia: "Lunes", numeroBloque: 2, horaInicio: "08:50", horaTermino: "09:30" };
    vi.mocked(horariosRepository.findParaImportarSalas).mockResolvedValue({ entradas: [entrada(), segundo], salas: [{ id: 4, nombre: "101-AA" }] } as never);
    const datos = fila().slice(0, 8); datos.push(...Array(12).fill(""), "Lunes", "08:10-09:30", "101-AA");
    expect((await horariosService.importarExcelSalas(9, await archivo([datos]))).actualizadas).toBe(1);
    expect(horariosRepository.actualizarSalasEnTransaccion).toHaveBeenCalledWith(9, [{ id: 1, salaId: 4 }, { id: 2, salaId: 4 }]);
  });
  it("permite intercambio de salas al validar el estado final", async () => {
    vi.mocked(horariosRepository.findParaImportarSalas).mockResolvedValue({ entradas: [entrada(1, "INF100", 5), entrada(2, "INF200", 4)], salas: [{ id: 4, nombre: "101-AA" }, { id: 5, nombre: "102-AA" }] } as never);
    const otra = fila(); otra[0] = "INF200"; otra[10] = "102AA";
    expect((await horariosService.importarExcelSalas(9, await archivo([fila(), otra]))).errores).toEqual([]);
    expect(horariosRepository.actualizarSalasEnTransaccion).toHaveBeenCalledWith(9, [{ id: 1, salaId: 4 }, { id: 2, salaId: 5 }]);
  });
  it("sala sin día/horario es error; nombre/profesor vacíos son opcionales", async () => {
    const incompleta = fila(); incompleta[8] = ""; incompleta[9] = "";
    expect((await horariosService.importarExcelSalas(9, await archivo([incompleta]))).errores).toHaveLength(2);
    expect(horariosRepository.actualizarSalasEnTransaccion).not.toHaveBeenCalled();
    const opcionales = fila(); opcionales[3] = ""; opcionales[7] = "";
    expect((await horariosService.importarExcelSalas(9, await archivo([opcionales]))).errores).toEqual([]);
  });
  it("rechaza claves visibles ambiguas sin usar el profesor para desambiguar", async () => {
    const otra = entrada(2); otra.oferta.profesorId = 8;
    vi.mocked(horariosRepository.findParaImportarSalas).mockResolvedValue({ entradas: [entrada(), otra], salas: [{ id: 4, nombre: "101-AA" }] } as never);
    expect((await horariosService.importarExcelSalas(9, await archivo())).errores[0]).toMatchObject({ fila: 2, columna: "Horario 1" });
    expect(horariosRepository.actualizarSalasEnTransaccion).not.toHaveBeenCalled();
  });
  it("HTTP conserva los errores de negocio", async () => {
    const datos = fila(); datos[10] = "inexistente";
    const respuesta = await request(aplicacion).post("/horarios/excel/salas/importar?semestreId=9").set("x-rol-prueba", "secretaria").attach("archivo", await archivo([datos]), "salas.xlsx");
    expect(respuesta.status).toBe(400);
    expect(respuesta.body.errores[0]).toMatchObject({ fila: 2, columna: "Sala 1" });
    expect(horariosRepository.actualizarSalasEnTransaccion).not.toHaveBeenCalled();
  });
  it.each(["admin", "secretaria"])("upload HTTP para %s", async (rol) => {
    const respuesta = await request(aplicacion).post("/horarios/excel/salas/importar?semestreId=9").set("x-rol-prueba", rol).attach("archivo", await archivo(), "salas.xlsx");
    expect(respuesta.status).toBe(200); expect(respuesta.body.data.actualizadas).toBe(1);
  });
  it("HTTP devuelve detalles para query, archivo ausente, upload incorrecto y formato inválido", async () => {
    for (const consulta of ["", "?semestreId=0", "?semestreId=9"]) {
      const respuesta = await request(aplicacion).post(`/horarios/excel/salas/importar${consulta}`).set("x-rol-prueba", "admin");
      expect(respuesta.status).toBe(400); expect(respuesta.body.errores.length).toBeGreaterThan(0);
    }
    for (const campo of ["archivo", "otro"]) {
      const respuesta = await request(aplicacion).post("/horarios/excel/salas/importar?semestreId=9").set("x-rol-prueba", "admin").attach(campo, Buffer.from("inválido"), "salas.xlsx");
      expect(respuesta.status).toBe(400); expect(respuesta.body.errores.length).toBeGreaterThan(0);
    }
  });
  it("HTTP exige autenticación y rol administrativo", async () => {
    expect((await request(aplicacion).post("/horarios/excel/salas/importar?semestreId=9")).status).toBe(401);
    expect((await request(aplicacion).post("/horarios/excel/salas/importar?semestreId=9").set("x-rol-prueba", "profesor")).status).toBe(403);
    expect(horariosRepository.findParaImportarSalas).not.toHaveBeenCalled();
  });
});
