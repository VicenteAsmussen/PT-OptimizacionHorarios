import test from 'node:test';
import assert from 'node:assert/strict';

test('only secretary may access monitoring', async () => {
  const { puedeVerSeguimiento } = await import('./estado.ts');
  assert.equal(puedeVerSeguimiento('secretaria'), true);
  for (const rol of ['admin', 'profesor', 'jefe_carrera', undefined, null]) assert.equal(puedeVerSeguimiento(rol), false);
});

test('submission status is presence only and zero is retained for missing submissions', async () => {
  const { estadoEnvio } = await import('./estado.ts');
  assert.equal(estadoEnvio(false), 'No enviada');
  assert.equal(estadoEnvio(true), 'Enviada');
});

test('changing planning or refreshing clears previous results and rejects late responses', async () => {
  const { estadoInicial, reducirSeguimiento } = await import('./estado.ts');
  let estado = reducirSeguimiento(estadoInicial, { tipo: 'seleccionar', id: 10 });
  const revisionAnterior = estado.revision;
  estado = reducirSeguimiento(estado, { tipo: 'cargada', id: 10, revision: revisionAnterior, filas: [{ profesorId: 7, bloquesEnviados: 0 }] });
  assert.equal(estado.filas[0].bloquesEnviados, 0);
  estado = reducirSeguimiento(estado, { tipo: 'seleccionar', id: 11 });
  assert.equal(estado.filas, null);
  assert.equal(reducirSeguimiento(estado, { tipo: 'cargada', id: 10, revision: revisionAnterior, filas: [] }), estado);
  const revision = estado.revision;
  estado = reducirSeguimiento(estado, { tipo: 'recargar' });
  assert.equal(reducirSeguimiento(estado, { tipo: 'fallo', id: 11, revision, mensaje: 'Error anterior' }), estado);
  estado = reducirSeguimiento(estado, { tipo: 'fallo', id: 11, revision: estado.revision, mensaje: 'Sin conexión' });
  assert.equal(estado.error, 'Sin conexión');
  estado = reducirSeguimiento(estado, { tipo: 'recargar' });
  assert.equal(estado.error, '');
  estado = reducirSeguimiento(estado, { tipo: 'cargada', id: 11, revision: estado.revision, filas: [] });
  assert.deepEqual(estado.filas, []);
});
