import { beforeEach, expect, it, vi } from "vitest";
import ExcelJS from "exceljs";
import { horariosService } from "../src/services/horarios.service.js";
import { horariosRepository } from "../src/repositories/horarios.repository.js";
import { encabezadosExcelSalas } from "../src/utils/excel-salas.js";
vi.mock("../src/repositories/horarios.repository.js", () => ({ horariosRepository: {
  findCarreraSecretariaByUsuarioId: vi.fn(), checkSemestreExists: vi.fn(), findContextoExternos: vi.fn(), crearExternosEnTransaccion: vi.fn(),
} }));
const usuario = { id: 1, rol: "secretaria" };
const contexto = () => ({ departamentoValido: true, asignaturas: [{ codigo: "INF100", nombre: "Programación" }], profesores: [{ id: 7, nombre: "Ana Pérez" }], tipos: [{ id: 1, tipo: "Teórica" }], bloques: [{ id: 10, dia: "Lunes", numeroBloque: 1, horaInicio: "08:10", horaTermino: "08:50" }], ofertas: [], ocupaciones: [] });
async function archivo(cambio: Record<number, string | number> = {}, duplicada = false) {
  const libro = new ExcelJS.Workbook(); const hoja = libro.addWorksheet("Externos"); hoja.addRow([...encabezadosExcelSalas]);
  const fila: (string | number)[] = ["INF100", "Programación", 2, 40, " ANA   PEREZ ", "t", "Lunes", "08:10-08:50", "Sala inexistente ignorada"];
  for (const [indice, valor] of Object.entries(cambio)) fila[Number(indice)] = valor;
  hoja.addRow(fila); if (duplicada) hoja.addRow(fila);
  return Buffer.from(await libro.xlsx.writeBuffer());
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(horariosRepository.findCarreraSecretariaByUsuarioId).mockResolvedValue({ carreraId: 3 });
  vi.mocked(horariosRepository.checkSemestreExists).mockResolvedValue(true);
  vi.mocked(horariosRepository.findContextoExternos).mockResolvedValue(contexto() as never);
});
it.each(["t", "teo", "teórica", "teorica"])("acepta alias %s e ignora Sala N sin asignarla", async (tipo) => {
  const resultado = await horariosService.importarExcelExternos(9, 4, await archivo({ 5: tipo }), usuario);
  expect(resultado).toEqual({ ofertasCreadas: 1, horariosCreados: 1, errores: [] });
  expect(horariosRepository.findContextoExternos).toHaveBeenCalledWith(9, 4, 3);
  expect(horariosRepository.crearExternosEnTransaccion).toHaveBeenCalledWith(9, [{ asignaturaCodigo: "INF100", profesorId: 7, seccion: 2, cupos: 40, sesiones: [{ bloqueId: 10, tipoHoraId: 1 }] }]);
});
it.each([[0, "XYZ", "Código Asig."], [4, "Otro", "Profesor"], [5, "Otro", "Tipo Hora 1"], [6, "Otro", "Día 1"], [7, "08:15-08:50", "Horario 1"], [3, -1, "Cupos"]])("rechaza columna %s sin escribir", async (indice, valor, columna) => {
  const resultado = await horariosService.importarExcelExternos(9, 4, await archivo({ [Number(indice)]: valor }), usuario);
  expect(resultado.errores).toEqual(expect.arrayContaining([expect.objectContaining({ fila: 2, columna })]));
  expect(horariosRepository.crearExternosEnTransaccion).not.toHaveBeenCalled();
});
it("rechaza ofertas existentes y duplicadas", async () => {
  expect((await horariosService.importarExcelExternos(9, 4, await archivo({}, true), usuario)).errores.length).toBeGreaterThan(0);
  const datos = contexto();
  vi.mocked(horariosRepository.findContextoExternos).mockResolvedValue({ ...datos, ofertas: [{ asignaturaCodigo: "INF100", seccion: 2 }] } as never);
  expect((await horariosService.importarExcelExternos(9, 4, await archivo(), usuario)).errores[0]?.columna).toBe("Sección");
  expect(horariosRepository.crearExternosEnTransaccion).not.toHaveBeenCalled();
});
it("rechaza profesor ambiguo y departamento gestionado o ajeno", async () => {
  const datos = contexto(); datos.profesores.push({ id: 8, nombre: "ANA PEREZ" });
  vi.mocked(horariosRepository.findContextoExternos).mockResolvedValue(datos as never);
  expect((await horariosService.importarExcelExternos(9, 4, await archivo(), usuario)).errores[0]?.columna).toBe("Profesor");
  vi.mocked(horariosRepository.findContextoExternos).mockResolvedValue({ ...datos, departamentoValido: false } as never);
  await expect(horariosService.importarExcelExternos(9, 4, await archivo(), usuario)).rejects.toThrow(/Departamento/);
  expect(horariosRepository.crearExternosEnTransaccion).not.toHaveBeenCalled();
});
it("admin no necesita perfil de secretaria", async () => {
  expect((await horariosService.importarExcelExternos(9, 4, await archivo({ 8: "" }), { id: 1, rol: "admin" })).errores).toEqual([]);
  expect(horariosRepository.findCarreraSecretariaByUsuarioId).not.toHaveBeenCalled();
  expect(horariosRepository.findContextoExternos).toHaveBeenCalledWith(9, 4, undefined);
});
