import { beforeEach, expect, it, vi } from "vitest";
vi.mock("../../src/config/db.js", () => ({ db: {} }));
import ExcelJS from "exceljs";
import { importarHorariosExternos, encabezadosExcelExternos } from "../../src/utils/excel/excel-horarios-externos.js";
import { horariosRepository } from "../../src/repositories/horarios.repository.js";
import { horariosService } from "../../src/services/horarios.service.js";

vi.mock("../../src/repositories/horarios.repository.js", () => ({ horariosRepository: {
  checkPlanificacionExists: vi.fn(), findContextoExternos: vi.fn(), findPlanificacionById: vi.fn(), sincronizarExternosEnTransaccion: vi.fn(), findCarreraSecretariaByUsuarioId: vi.fn(),
} }));
const asignaturas = [
  { codigo: "PAR", nombre: "Even course", semestreMalla: 2 },
  { codigo: "IMPAR", nombre: "Odd course", semestreMalla: 3 },
];
function contexto(codigoPeriodo = "2026-2") {
  return { bloquesReservadosIds: [] as number[], codigoPeriodo, departamentoValido: true, asignaturas, profesores: [{ id: 7, rut: "12345678-5", departamentoId: 4 }],
    tipos: [{ id: 1, tipo: "Teórica" }], ofertas: [], ocupaciones: [],
    bloques: [{ id: 10, dia: "Lunes", horaInicio: "08:10", horaTermino: "08:50", numeroBloque: 1 },
      { id: 11, dia: "Martes", horaInicio: "08:10", horaTermino: "08:50", numeroBloque: 1 }] };
}
async function archivo(codigos: string[], invalida = false) {
  const libro = new ExcelJS.Workbook(); const hoja = libro.addWorksheet("External");
  hoja.addRow([...encabezadosExcelExternos]);
  codigos.forEach((codigo, indice) => hoja.addRow([codigo, "Informational", 1, invalida && indice === 1 ? -1 : 30,
    "12345678-5", "Informational", "t", indice ? "Martes" : "Lunes", "08:10-08:50"]));
  return Buffer.from(await libro.xlsx.writeBuffer());
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(horariosRepository.checkPlanificacionExists).mockResolvedValue(true);
  vi.mocked(horariosRepository.findContextoExternos).mockResolvedValue(contexto() as never);
  vi.mocked(horariosRepository.sincronizarExternosEnTransaccion).mockResolvedValue({ ofertasCreadas: 1, ofertasActualizadas: 0, ofertasEliminadas: 0 });
});
it.each([['2026-1', 'IMPAR', 'PAR'], ['2026-2', 'PAR', 'IMPAR']])(
  'exige paridad de malla coincidente con %s y permite faltantes de paridad opuesta', async (periodo, obligatorio, opcional) => {
    vi.mocked(horariosRepository.findContextoExternos).mockResolvedValue(contexto(periodo) as never);
    const resultado = await importarHorariosExternos(9, 4, await archivo([obligatorio]), 3);
    expect(resultado.errores).toEqual([]);
    expect(resultado).toMatchObject({ cobertura: expect.arrayContaining([
      expect.objectContaining({ codigo: obligatorio, obligatorio: true, estado: 'cargada', secciones: [1] }),
      expect.objectContaining({ codigo: opcional, obligatorio: false, estado: 'faltante_opcional', secciones: [] }),
    ]) });
    expect(horariosRepository.sincronizarExternosEnTransaccion).toHaveBeenCalledOnce();
  });
it.each([['2026-1', 'PAR', 'IMPAR'], ['2026-2', 'IMPAR', 'PAR']])(
  'rechaza horarios obligatorios ausentes en %s sin persistir ninguna fila válida', async (periodo, opcional, faltante) => {
    vi.mocked(horariosRepository.findContextoExternos).mockResolvedValue(contexto(periodo) as never);
    const resultado = await importarHorariosExternos(9, 4, await archivo([opcional]), 3);
    expect(resultado.errores).toContainEqual(expect.objectContaining({ codigoAsignatura: faltante, columna: 'Cobertura' }));
    expect(resultado).toMatchObject({ ofertasCreadas: 0, cobertura: expect.arrayContaining([
      expect.objectContaining({ codigo: faltante, estado: 'faltante_obligatoria' }),
      expect.objectContaining({ codigo: opcional, estado: 'cargada' }),
    ]) });
    expect(horariosRepository.sincronizarExternosEnTransaccion).not.toHaveBeenCalled();
  });
it('posterga la cobertura hasta validar todos los cupos, incluidas las filas opcionales', async () => {
  const resultado = await importarHorariosExternos(9, 4, await archivo(['PAR', 'IMPAR'], true), 3);
  expect(resultado.errores).toEqual([expect.objectContaining({ fila: 3, columna: 'Cupos', codigoAsignatura: 'IMPAR', valor: '-1' })]);
  expect(resultado).toMatchObject({ ofertasCreadas: 0, horariosCreados: 0, cobertura: [] });
  expect(horariosRepository.sincronizarExternosEnTransaccion).not.toHaveBeenCalled();
});
it('conserva asignaturas programadas de paridad opuesta e ignora filas ajenas malformadas', async () => {
  const resultado = await importarHorariosExternos(9, 4, await archivo(['PAR', 'IMPAR', 'AJENA']), 3);
  expect(resultado.errores).toEqual([]);
  expect(horariosRepository.sincronizarExternosEnTransaccion).toHaveBeenCalledWith(9, 4,
    [expect.objectContaining({ asignaturaCodigo: 'PAR' }), expect.objectContaining({ asignaturaCodigo: 'IMPAR' })], 3);
});
it('la cobertura persistida excluye ofertas sin horarios', async () => {
  // Una oferta vacía no acredita cobertura, la ocupación distingue carga declarada de horario registrado.
  vi.mocked(horariosRepository.findCarreraSecretariaByUsuarioId).mockResolvedValue({ carreraId: 3 } as never);
  vi.mocked(horariosRepository.findPlanificacionById).mockResolvedValue({ id: 9, carreraId: 3, codigo: '2026-2' } as never);
  vi.mocked(horariosRepository.findContextoExternos).mockResolvedValue({ ...contexto(),
    ofertas: [{ id: 20, asignaturaCodigo: 'PAR', seccion: 1 }, { id: 21, asignaturaCodigo: 'IMPAR', seccion: 2 }],
    ocupaciones: [{ ofertaId: 21, profesorId: 7, bloqueId: 11 }],
  } as never);
  const resultado = await horariosService.coberturaExcelExternos(9, 4, { id: 1, rol: 'secretaria' });
  expect(horariosRepository.findContextoExternos).toHaveBeenCalledWith(9, 4, 3);
  expect(resultado.cobertura).toMatchObject([
    { codigo: 'PAR', estado: 'faltante_obligatoria', secciones: [] },
    { codigo: 'IMPAR', estado: 'cargada', secciones: [2] },
  ]);
});
it.each(['admin', 'profesor'])('las llamadas directas al servicio de %s no consultan cobertura externa ni acceden a persistencia', async rol => {
  await expect(horariosService.coberturaExcelExternos(9, 4, { id: 1, rol })).rejects.toMatchObject({ statusCode: 403 });
  expect(horariosRepository.findCarreraSecretariaByUsuarioId).not.toHaveBeenCalled();
  expect(horariosRepository.findPlanificacionById).not.toHaveBeenCalled();
  expect(horariosRepository.findContextoExternos).not.toHaveBeenCalled();
});
it.each([undefined, { carreraId: 99 }])('la cobertura externa de secretaría exige un perfil de la carrera seleccionada %j', async perfil => {
  vi.mocked(horariosRepository.findCarreraSecretariaByUsuarioId).mockResolvedValue(perfil as never);
  vi.mocked(horariosRepository.findPlanificacionById).mockResolvedValue({ id: 9, carreraId: 3, codigo: '2026-2' } as never);
  await expect(horariosService.coberturaExcelExternos(9, 4, { id: 1, rol: 'secretaria' })).rejects.toMatchObject({ statusCode: 403 });
  expect(horariosRepository.findContextoExternos).not.toHaveBeenCalled();
});
