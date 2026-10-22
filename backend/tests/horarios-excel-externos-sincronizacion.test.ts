import { beforeEach, expect, it, vi } from "vitest";
import ExcelJS from "exceljs";
import { importarHorariosExternos, encabezadosExcelExternos } from "../src/utils/excel-horarios-externos.js";
import { horariosRepository } from "../src/repositories/horarios.repository.js";

vi.mock("../src/repositories/horarios.repository.js", () => ({ horariosRepository: {
  checkPlanificacionExists: vi.fn(), findContextoExternos: vi.fn(), crearExternosEnTransaccion: vi.fn(), sincronizarExternosEnTransaccion: vi.fn(),
} }));
const asignatura = { codigo: "MAT100", nombre: "Álgebra", semestreMalla: 2 };
const fila = () => ["MAT100", "Álgebra", 1, 35, "12345678-5", "Docente", "t", "Lunes", "08:10-08:50"];
const contexto = () => ({ codigoPeriodo: "2026-2", departamentoValido: true, asignaturas: [asignatura], profesores: [{ id: 7, rut: "12345678-5", departamentoId: 4 }],
  tipos: [{ id: 1, tipo: "Teórica" }], bloques: [{ id: 10, dia: "Lunes", horaInicio: "08:10", horaTermino: "08:50", numeroBloque: 1 }],
  ofertas: [{ id: 20, asignaturaCodigo: "MAT100", seccion: 1 }], ocupaciones: [{ ofertaId: 20, profesorId: 7, bloqueId: 10 }] });
async function archivo(filas: (string | number)[][]) {
  const libro = new ExcelJS.Workbook(); const hoja = libro.addWorksheet("Externos");
  hoja.addRow([...encabezadosExcelExternos]); filas.forEach(datos => hoja.addRow(datos));
  return Buffer.from(await libro.xlsx.writeBuffer());
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(horariosRepository.checkPlanificacionExists).mockResolvedValue(true);
  vi.mocked(horariosRepository.findContextoExternos).mockResolvedValue(contexto() as never);
  vi.mocked(horariosRepository.sincronizarExternosEnTransaccion).mockResolvedValue({ ofertasCreadas: 0, ofertasActualizadas: 1, ofertasEliminadas: 1 });
});
it("ignora códigos ajenos antes de validar sus otros datos y reemplaza la oferta existente", async () => {
  const resultado = await importarHorariosExternos(9, 4, await archivo([["AJENA", "Otro", "inválida"], fila()]), 3);
  expect(resultado.errores).toEqual([]);
  expect(horariosRepository.sincronizarExternosEnTransaccion).toHaveBeenCalledWith(9, 4, [expect.objectContaining({ asignaturaCodigo: "MAT100", seccion: 1 })], 3);
  expect(resultado).toMatchObject({ ofertasActualizadas: 1, ofertasEliminadas: 1,
    asignaturasCargadas: [{ codigo: "MAT100", nombre: "Álgebra", semestreMalla: 2, secciones: [1] }] });
});
it("identifica asignatura, columna y dato inválido sin escribir", async () => {
  const datos = fila(); datos[3] = -1;
  const resultado = await importarHorariosExternos(9, 4, await archivo([datos]), 3);
  expect(resultado.errores).toContainEqual(expect.objectContaining({ fila: 2, columna: "Cupos", codigoAsignatura: "MAT100", nombreAsignatura: "Álgebra", valor: "-1" }));
  expect(horariosRepository.sincronizarExternosEnTransaccion).not.toHaveBeenCalled();
});
it("no borra la carga anterior si el archivo no contiene asignaturas pertinentes", async () => {
  const resultado = await importarHorariosExternos(9, 4, await archivo([["AJENA"]]), 3);
  expect(resultado.errores).toContainEqual(expect.objectContaining({ columna: "archivo" }));
  expect(horariosRepository.sincronizarExternosEnTransaccion).not.toHaveBeenCalled();
});
it("mantiene error de código ausente y rechaza secciones duplicadas del archivo", async () => {
  const resultado = await importarHorariosExternos(9, 4, await archivo([["", "Sin código"], fila(), fila()]), 3);
  expect(resultado.errores).toContainEqual(expect.objectContaining({ fila: 2, columna: "Código Asig." }));
  expect(resultado.errores).toContainEqual(expect.objectContaining({ fila: 4, columna: "Sección", codigoAsignatura: "MAT100" }));
  expect(horariosRepository.sincronizarExternosEnTransaccion).not.toHaveBeenCalled();
});
it("mantiene conflictos con ofertas no reemplazadas", async () => {
  const datos = contexto(); datos.ocupaciones[0]!.ofertaId = 99;
  vi.mocked(horariosRepository.findContextoExternos).mockResolvedValue(datos as never);
  const resultado = await importarHorariosExternos(9, 4, await archivo([fila()]), 3);
  expect(resultado.errores).toContainEqual(expect.objectContaining({ columna: "Horario 1", codigoAsignatura: "MAT100" }));
  expect(horariosRepository.sincronizarExternosEnTransaccion).not.toHaveBeenCalled();
});
it("acepta ofertas de distinta paridad sin exigir una columna Carrera", async () => {
  const datos = contexto(); datos.asignaturas[0]!.semestreMalla = 3;
  vi.mocked(horariosRepository.findContextoExternos).mockResolvedValue(datos as never);
  const resultado = await importarHorariosExternos(9, 4, await archivo([fila()]), 3);
  expect(resultado.errores).toEqual([]);
  expect(resultado).toMatchObject({ asignaturasCargadas: [expect.objectContaining({ semestreMalla: 3 })] });
});
