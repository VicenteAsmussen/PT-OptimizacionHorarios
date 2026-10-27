import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { puedeAdministrarPeriodos, confirmarReinicio, carrerasDisponibles, puedeCambiarEstado, accionesReinicio, puedeReiniciar } from './modelo.ts';

test('only administrators can maintain periods', () => {
  for (const rol of [undefined, null, 'secretaria', 'profesor', 'ADMIN']) assert.equal(puedeAdministrarPeriodos(rol), false);
  assert.equal(puedeAdministrarPeriodos('admin'), true);
});
test('reset confirmation binds the exact selected plan and scope, never an implicit career', () => {
  const resumen = { planificacion: { id: 7, codigo: '2026-2' }, alcance: 'gestionadas' };
  assert.equal(confirmarReinicio(resumen, 7, 'gestionadas', '2026-2'), true);
  for (const argumentos of [[resumen, 8, 'gestionadas', '2026-2'], [resumen, 7, 'todas', '2026-2'],
    [resumen, 7, 'gestionadas', '2026-1'], [null, 7, 'gestionadas', '2026-2'], [resumen, 7, 'gestionadas', ' 2026-2']]) {
    assert.equal(confirmarReinicio(...argumentos), false);
  }
});
test('career choices are deduplicated, without selecting or merging period codes', () => {
  const planes = [{ carrera: { id: 1, nombre: 'A' } }, { carrera: { id: 1, nombre: 'A' } }, { carrera: { id: 2, nombre: 'B' } }];
  assert.deepEqual(carrerasDisponibles(planes), [{ id: 1, nombre: 'A' }, { id: 2, nombre: 'B' }]);
});
test('return to preparation requires no managed schedules; advanced states require managed schedules', () => {
  for (const origen of ['propuesta', 'publicado']) {
    assert.equal(puedeCambiarEstado(origen, 'preparacion', 4), false);
    assert.equal(puedeCambiarEstado(origen, 'preparacion', 0), true);
    assert.equal(puedeCambiarEstado(origen, 'propuesta', 4), origen !== 'propuesta');
    assert.equal(puedeCambiarEstado(origen, 'publicado', 4), origen !== 'publicado');
  }
  assert.equal(puedeCambiarEstado('preparacion', 'preparacion', 0), false);
});
test('admin publication requires managed schedules and offer reset requires an empty scope schedule', () => {
  assert.equal(puedeCambiarEstado('propuesta', 'publicado', 0), false);
  assert.equal(puedeCambiarEstado('propuesta', 'publicado', 4), true);
  assert.equal(puedeReiniciar({ objetivo: 'ofertas' }, { ofertas: 2, horarios: 1 }), false);
  assert.equal(puedeReiniciar({ objetivo: 'ofertas' }, { ofertas: 2, horarios: 0 }), true);
  assert.equal(puedeReiniciar({ objetivo: 'horarios' }, { ofertas: 2, horarios: 1 }), true);
});
test('four direct actions encode target and scope without an all-scope page option', () => {
  assert.deepEqual(accionesReinicio.map(({ objetivo, alcance }) => ({ objetivo, alcance })), [
    { objetivo: 'horarios', alcance: 'gestionadas' }, { objetivo: 'horarios', alcance: 'externas' },
    { objetivo: 'ofertas', alcance: 'gestionadas' }, { objetivo: 'ofertas', alcance: 'externas' },
  ]);
});
test('final admin flow admits proposal/publication only with managed schedules', () => {
  for (const destino of ['propuesta', 'publicado']) {
    assert.equal(puedeCambiarEstado('preparacion', destino, 0), false);
    assert.equal(puedeCambiarEstado('preparacion', destino, 1), true);
  }
  assert.equal(puedeCambiarEstado('propuesta', 'publicado', 1), true);
  assert.equal(puedeCambiarEstado('publicado', 'propuesta', 1), true);
});
test('API sends exact planning, scope, confirmation and previous state with authenticated requests', async () => {
  const ts = await import('typescript');
  const fuente = (await readFile(new URL('./administracion-periodos.api.ts', import.meta.url), 'utf8'))
    .replace("'../../lib/api'", JSON.stringify(new URL('../../lib/api.ts', import.meta.url).href));
  const codigo = ts.transpileModule(fuente, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  const { administracionPeriodosApi: api } = await import(`data:text/javascript;base64,${Buffer.from(codigo).toString('base64')}`);
  const original = globalThis.fetch;
  const solicitudes = [];
  try {
    globalThis.fetch = async (ruta, opciones) => {
      solicitudes.push({ ruta, opciones });
      return new Response(JSON.stringify({ status: 'success', data: { ofertas: 2 } }), { status: 200 });
    };
    assert.deepEqual(await api.resumen(7, 'gestionadas'), { ofertas: 2 });
    assert.match(solicitudes[0].ruta, /administracion-periodos\/7\/resumen\?alcance=gestionadas$/);
    assert.equal(solicitudes[0].opciones.cache, 'no-store');
    const datos = { objetivo: 'ofertas', alcance: 'todas', confirmacion: '2026-2', huella: 'a'.repeat(64) };
    await api.reiniciar(7, datos);
    assert.match(solicitudes[1].ruta, /administracion-periodos\/7\/reiniciar$/);
    assert.equal(solicitudes[1].opciones.method, 'POST');
    assert.deepEqual(JSON.parse(solicitudes[1].opciones.body), datos);
    await api.cambiarEstado(7, 'publicado', 'preparacion');
    assert.match(solicitudes[2].ruta, /administracion-periodos\/7\/estado$/);
    assert.equal(solicitudes[2].opciones.method, 'PATCH');
    assert.deepEqual(JSON.parse(solicitudes[2].opciones.body), { estadoAnterior: 'publicado', estadoPlanificacion: 'preparacion' });
    for (const { opciones } of solicitudes) assert.equal(opciones.credentials, 'include');
    globalThis.fetch = async () => new Response(JSON.stringify({ message: 'Los datos cambiaron' }), { status: 409 });
    await assert.rejects(api.reiniciar(7, datos), error => error.status === 409 && error.message === 'Los datos cambiaron');
  } finally { globalThis.fetch = original; }
});
test('navigation and direct route use an administrator-only guard', async () => {
  const router = await readFile(new URL('../../app/router.tsx', import.meta.url), 'utf8');
  const layout = await readFile(new URL('../../components/layout/AppLayout.tsx', import.meta.url), 'utf8');
  assert.match(router, /element: <RequireAdministracionPeriodos \/>, children: \[\s*\{ path: "administracion-periodos"/);
  assert.match(layout, /puedeAdministrarPeriodos\(usuario\?\.rol\) && \(\s*<NavLink to="\/app\/administracion-periodos"/);
});
