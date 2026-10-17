import { beforeEach, expect, it, vi } from "vitest";
import ExcelJS from "exceljs";
import { horariosService } from "../src/services/horarios.service.js";
import { horariosRepository } from "../src/repositories/horarios.repository.js";
import { encabezadosExcelSalas } from "../src/utils/excel-salas.js";
vi.mock("../src/repositories/horarios.repository.js", () => ({ horariosRepository: {
  findCarreraSecretariaByUsuarioId: vi.fn(), checkSemestreExists: vi.fn(), findContextoExternos: vi.fn(), crearExternosEnTransaccion: vi.fn(),
} }));
const encabezados = ["Código Asig.", "Nombre Asignatura", "Sección", "Cupos", "RUT Profesor", "Profesor",
  ...[1, 2, 3, 4, 5].flatMap((numero) => [`Tipo Hora ${numero}`, `Día ${numero}`, `Horario ${numero}`, `Sala ${numero}`])];
const usuario = { id: 1, rol: "secretaria" };
const contexto = () => ({ departamentoValido: true, asignaturas: [{ codigo: "INF100", nombre: "Programación" }], profesores: [{ id: 7, rut: "12345678-5", nombre: "Ana Pérez", departamentoId: 4 }], tipos: [{ id: 1, tipo: "Teórica" }], bloques: [{ id: 10, dia: "Lunes", numeroBloque: 1, horaInicio: "08:10", horaTermino: "08:50" }], ofertas: [] as { asignaturaCodigo: string; seccion: number }[], ocupaciones: [] as { profesorId: number; bloqueId: number }[] });
const filaBase = () => ["INF100", "Programación", 2, 40, "12345678-5", " ANA   PEREZ ", "t", "Lunes", "08:10-08:50", "Sala inexistente ignorada"];
async function libroConFilas(filas: (string | number)[][], titulos: readonly string[] = encabezados) {
  const libro = new ExcelJS.Workbook();
  const hoja = libro.addWorksheet("Externos");
  hoja.addRow([...titulos]);
  filas.forEach((fila) => hoja.addRow(fila));
  return Buffer.from(await libro.xlsx.writeBuffer());
}
async function archivo(cambio: Record<number, string | number> = {}, duplicada = false) {
  const fila = filaBase();
  for (const [indice, valor] of Object.entries(cambio)) fila[Number(indice)] = valor;
  return libroConFilas(duplicada ? [fila, fila] : [fila]);
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(horariosRepository.findCarreraSecretariaByUsuarioId).mockResolvedValue({ carreraId: 3 });
  vi.mocked(horariosRepository.checkSemestreExists).mockResolvedValue(true);
  vi.mocked(horariosRepository.findContextoExternos).mockResolvedValue(contexto() as never);
});
it.each(["t", "teo", "teórica", "teorica"])("acepta alias %s e ignora Sala N", async (tipo) => {
  const resultado = await horariosService.importarExcelExternos(9, 4, await archivo({ 6: tipo }), usuario);
  expect(resultado).toEqual({ ofertasCreadas: 1, horariosCreados: 1, errores: [], advertencias: [] });
  expect(horariosRepository.findContextoExternos).toHaveBeenCalledWith(9, 4, 3);
  expect(horariosRepository.crearExternosEnTransaccion).toHaveBeenCalledWith(9, [{ asignaturaCodigo: "INF100", profesorId: 7, seccion: 2, cupos: 40, sesiones: [{ bloqueId: 10, tipoHoraId: 1 }] }]);
});
it.each([[0, "XYZ", "Código Asig."], [1, "Otra asignatura", "Nombre Asignatura"], [6, "Otro", "Tipo Hora 1"], [7, "Otro", "Día 1"], [8, "08:15-08:50", "Horario 1"], [3, -1, "Cupos"], [4, "", "RUT Profesor"], [4, "12345678-9", "RUT Profesor"], [4, "11111111-1", "RUT Profesor"]])("rechaza columna %s sin escribir", async (indice, valor, columna) => {
  const resultado = await horariosService.importarExcelExternos(9, 4, await archivo({ [Number(indice)]: valor }), usuario);
  expect(resultado.errores).toEqual(expect.arrayContaining([expect.objectContaining({ fila: 2, columna })]));
  expect(resultado.ofertasCreadas).toBe(0);
  expect(horariosRepository.crearExternosEnTransaccion).not.toHaveBeenCalled();
});
it.each(["12.345.678-5", "123456785", "12.345.6785"])("resuelve RUT formateado %s", async (rut) => {
  expect((await horariosService.importarExcelExternos(9, 4, await archivo({ 4: rut }), usuario)).errores).toEqual([]);
  expect(horariosRepository.crearExternosEnTransaccion).toHaveBeenCalledWith(9, [expect.objectContaining({ profesorId: 7 })]);
});
it("selecciona exclusivamente por RUT entre profesores homónimos", async () => {
  const datos = contexto();
  datos.profesores.unshift({ id: 8, rut: "11111111-1", nombre: "Ana Pérez", departamentoId: 4 });
  vi.mocked(horariosRepository.findContextoExternos).mockResolvedValue(datos as never);
  expect((await horariosService.importarExcelExternos(9, 4, await archivo(), usuario)).errores).toEqual([]);
  expect(horariosRepository.crearExternosEnTransaccion).toHaveBeenCalledWith(9, [expect.objectContaining({ profesorId: 7 })]);
});
it.each(["", "   ", "Otra Persona", "Ana Pérez"])("acepta nombre informativo %j sin advertencias ni modificar al profesor", async (nombre) => {
  const datos = contexto();
  const originales = contexto();
  vi.mocked(horariosRepository.findContextoExternos).mockResolvedValue(datos as never);
  const resultado = await horariosService.importarExcelExternos(9, 4, await archivo({ 5: nombre }), usuario);
  expect(resultado).toEqual({ ofertasCreadas: 1, horariosCreados: 1, errores: [], advertencias: [] });
  // La propuesta exacta solo contiene el ID numérico existente, nunca un nombre a actualizar.
  expect(horariosRepository.crearExternosEnTransaccion).toHaveBeenCalledWith(9, [{ asignaturaCodigo: "INF100", profesorId: 7, seccion: 2, cupos: 40, sesiones: [{ bloqueId: 10, tipoHoraId: 1 }] }]);
  expect(datos).toEqual(originales);
});
it.each(["ausente", "invalido", "desconocido", "duplicado", "ajeno"].flatMap((caso) =>
  ["", "   ", "Otra Persona", "Ana Pérez"].map((nombre) => ({ caso, nombre })),
))("rechaza RUT $caso con nombre $nombre sin escribir", async ({ caso, nombre }) => {
  const datos = contexto();
  if (caso === "duplicado") datos.profesores.push({ ...datos.profesores[0]!, id: 8, rut: "12.345.678-5" });
  if (caso === "ajeno") datos.profesores[0]!.departamentoId = 99;
  const rut = caso === "ausente" ? "" : caso === "invalido" ? "12345678-9" : caso === "desconocido" ? "11111111-1" : "12345678-5";
  vi.mocked(horariosRepository.findContextoExternos).mockResolvedValue(datos as never);
  const resultado = await horariosService.importarExcelExternos(9, 4, await archivo({ 4: rut, 5: nombre }), usuario);
  expect(resultado.errores).toContainEqual(expect.objectContaining({ fila: 2, columna: "RUT Profesor" }));
  expect(resultado.errores.some((error) => error.columna === "Profesor")).toBe(false);
  expect(resultado.advertencias).toEqual([]);
  expect(resultado.ofertasCreadas).toBe(0);
  expect(horariosRepository.crearExternosEnTransaccion).not.toHaveBeenCalled();
});
it("rechaza ofertas existentes y duplicadas", async () => {
  expect((await horariosService.importarExcelExternos(9, 4, await archivo({}, true), usuario)).errores).toContainEqual(expect.objectContaining({ columna: "Sección" }));
  const datos = contexto(); datos.ofertas.push({ asignaturaCodigo: "INF100", seccion: 2 });
  vi.mocked(horariosRepository.findContextoExternos).mockResolvedValue(datos as never);
  expect((await horariosService.importarExcelExternos(9, 4, await archivo(), usuario)).errores[0]?.columna).toBe("Sección");
  expect(horariosRepository.crearExternosEnTransaccion).not.toHaveBeenCalled();
});
it("rechaza departamento gestionado o ajeno", async () => {
  vi.mocked(horariosRepository.findContextoExternos).mockResolvedValue({ ...contexto(), departamentoValido: false } as never);
  await expect(horariosService.importarExcelExternos(9, 4, await archivo(), usuario)).rejects.toThrow(/Departamento/);
  expect(horariosRepository.crearExternosEnTransaccion).not.toHaveBeenCalled();
});
it("admin no necesita perfil de secretaria", async () => {
  expect((await horariosService.importarExcelExternos(9, 4, await archivo({ 9: "" }), { id: 1, rol: "admin" })).errores).toEqual([]);
  expect(horariosRepository.findCarreraSecretariaByUsuarioId).not.toHaveBeenCalled();
  expect(horariosRepository.findContextoExternos).toHaveBeenCalledWith(9, 4, undefined);
});
it("rechaza encabezados antiguos sin cambiar los de salas", async () => {
  expect(encabezadosExcelSalas).toHaveLength(25);
  expect(encabezadosExcelSalas[4]).toBe("Profesor");
  const resultado = await horariosService.importarExcelExternos(9, 4, await libroConFilas([filaBase().filter((_, indice) => indice !== 4)], encabezadosExcelSalas), usuario);
  expect(resultado.errores).toContainEqual(expect.objectContaining({ fila: 1, columna: "RUT Profesor" }));
  expect(horariosRepository.crearExternosEnTransaccion).not.toHaveBeenCalled();
});
it("lee quinta sesión en W:Z e ignora su sala", async () => {
  const resultado = await horariosService.importarExcelExternos(9, 4, await archivo({ 6: "", 7: "", 8: "", 22: "t", 23: "Lunes", 24: "08:10-08:50", 25: "Ignorada" }), usuario);
  expect(resultado).toMatchObject({ ofertasCreadas: 1, horariosCreados: 1, errores: [] });
  expect(horariosRepository.crearExternosEnTransaccion).toHaveBeenCalledWith(9, [expect.objectContaining({ sesiones: [{ bloqueId: 10, tipoHoraId: 1 }] })]);
});
it("no omite fila que solo contiene Z y rechaza columnas extra", async () => {
  const vacia = Array<string>(26).fill(""); vacia[25] = "Sala";
  expect((await horariosService.importarExcelExternos(9, 4, await libroConFilas([vacia]), usuario)).errores).toContainEqual(expect.objectContaining({ fila: 2, columna: "RUT Profesor" }));
  expect((await horariosService.importarExcelExternos(9, 4, await archivo({ 26: "Extra" }), usuario)).errores).toContainEqual(expect.objectContaining({ fila: 1, columna: "archivo" }));
  expect(horariosRepository.crearExternosEnTransaccion).not.toHaveBeenCalled();
});
it("valida todas las filas antes de escribir aunque la primera sea válida", async () => {
  const invalida = filaBase(); invalida[2] = 3; invalida[4] = "";
  const resultado = await horariosService.importarExcelExternos(9, 4, await libroConFilas([filaBase(), invalida]), usuario);
  expect(resultado.errores).toContainEqual(expect.objectContaining({ fila: 3, columna: "RUT Profesor" }));
  expect(resultado.ofertasCreadas).toBe(0);
  expect(horariosRepository.crearExternosEnTransaccion).not.toHaveBeenCalled();
});
it("mantiene choques de profesor por RUT y bloques repetidos entre sesiones", async () => {
  const datos = contexto(); datos.ocupaciones.push({ profesorId: 7, bloqueId: 10 });
  vi.mocked(horariosRepository.findContextoExternos).mockResolvedValue(datos as never);
  expect((await horariosService.importarExcelExternos(9, 4, await archivo(), usuario)).errores).toContainEqual(expect.objectContaining({ columna: "Horario 1" }));
  vi.mocked(horariosRepository.findContextoExternos).mockResolvedValue(contexto() as never);
  expect((await horariosService.importarExcelExternos(9, 4, await archivo({ 10: "t", 11: "Lunes", 12: "08:10-08:50" }), usuario)).errores).toContainEqual(expect.objectContaining({ columna: "Horario 2" }));
  expect(horariosRepository.crearExternosEnTransaccion).not.toHaveBeenCalled();
});
