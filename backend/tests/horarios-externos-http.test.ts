import { beforeEach, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";
import { horariosRouter as rutas } from "../src/routes/horarios.routes.js";
import { horariosService } from "../src/services/horarios.service.js";
import { ForbiddenError } from "../src/utils/errors.js";

vi.mock("../src/services/horarios.service.js", () => ({ horariosService: {
  importarExcelExternos: vi.fn(), coberturaExcelExternos: vi.fn(),
} }));
vi.mock("../src/middlewares/auth.middleware.js", () => ({ authenticate: (req: express.Request, _res: express.Response, next: express.NextFunction) => {
  req.user = { id: 1, rol: req.headers['x-test-role'] === 'profesor' ? 'profesor' : 'secretaria' } as express.Request['user']; next();
} }));
const app = express(); app.use('/horarios', rutas);
const resultado = { ofertasCreadas: 0, ofertasActualizadas: 0, ofertasEliminadas: 0, horariosCreados: 0,
  cobertura: [{ codigo: 'MAT', nombre: 'Course', semestreMalla: 2, obligatorio: true, estado: 'faltante_obligatoria', secciones: [] }],
  errores: [{ fila: 0, columna: 'Cobertura', codigoAsignatura: 'MAT', mensaje: 'Faltan horarios' }] };
beforeEach(() => vi.clearAllMocks());
it('multipart rejection carries row errors and the complete coverage without reporting success', async () => {
  vi.mocked(horariosService.importarExcelExternos).mockResolvedValue(resultado as never);
  const respuesta = await request(app).post('/horarios/excel/externos/importar?planificacionSemestreId=9&departamentoId=4')
    .attach('archivo', Buffer.from('workbook'), 'horarios.xlsx');
  expect(respuesta.status).toBe(400);
  expect(respuesta.body).toEqual({ status: 'error', errores: resultado.errores, data: resultado });
  expect(horariosService.importarExcelExternos).toHaveBeenCalledWith(9, 4, Buffer.from('workbook'), { id: 1, rol: 'secretaria' });
});
it('coverage GET validates its context, uses the authenticated user, and returns persisted coverage', async () => {
  vi.mocked(horariosService.coberturaExcelExternos).mockResolvedValue({ codigoPeriodo: '2026-2', cobertura: [] });
  expect((await request(app).get('/horarios/excel/externos/cobertura?planificacionSemestreId=9&departamentoId=4')).body)
    .toEqual({ status: 'success', data: { codigoPeriodo: '2026-2', cobertura: [] } });
  expect(horariosService.coberturaExcelExternos).toHaveBeenCalledWith(9, 4, { id: 1, rol: 'secretaria' });
  expect((await request(app).get('/horarios/excel/externos/cobertura?planificacionSemestreId=oops')).status).toBe(400);
});
it('professors cannot read coverage or import workbooks', async () => {
  expect((await request(app).get('/horarios/excel/externos/cobertura?planificacionSemestreId=9&departamentoId=4').set('x-test-role', 'profesor')).status).toBe(403);
  expect((await request(app).post('/horarios/excel/externos/importar?planificacionSemestreId=9&departamentoId=4').set('x-test-role', 'profesor')
    .attach('archivo', Buffer.from('workbook'), 'horarios.xlsx')).status).toBe(403);
  expect(horariosService.coberturaExcelExternos).not.toHaveBeenCalled();
  expect(horariosService.importarExcelExternos).not.toHaveBeenCalled();
});
it('the real application exposes coverage at the exact frontend URL and returns JSON errors', async () => {
  const { app: aplicacion } = await import('../src/app.js');
  const ruta = '/api/horarios-asignaturas/excel/externos/cobertura?planificacionSemestreId=9&departamentoId=4';
  vi.mocked(horariosService.coberturaExcelExternos).mockResolvedValue({ codigoPeriodo: '2026-2', cobertura: [] });
  const respuesta = await request(aplicacion).get(ruta);
  expect(respuesta.status).toBe(200);
  expect(respuesta.type).toBe('application/json');
  expect(respuesta.body).toEqual({ status: 'success', data: { codigoPeriodo: '2026-2', cobertura: [] } });
  const invalida = await request(aplicacion).get('/api/horarios-asignaturas/excel/externos/cobertura?planificacionSemestreId=oops');
  expect(invalida.status).toBe(400);
  expect(invalida.body.message).toEqual(expect.any(String));
  vi.mocked(horariosService.coberturaExcelExternos).mockRejectedValueOnce(new ForbiddenError('La planificación no pertenece a su carrera'));
  const prohibida = await request(aplicacion).get(ruta);
  expect(prohibida.status).toBe(403);
  expect(prohibida.body.message).toBe('La planificación no pertenece a su carrera');
});
