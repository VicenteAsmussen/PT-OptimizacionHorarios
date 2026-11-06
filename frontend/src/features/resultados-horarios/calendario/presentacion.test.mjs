import test from 'node:test';
import assert from 'node:assert/strict';

test('el nombre compacto usa las iniciales de cada palabra sin perder números de nivel', async () => {
  const { nombreCompacto } = await import('./presentacion.ts');
  assert.equal(nombreCompacto('Cálculo Diferencial'), 'CD');
  assert.equal(nombreCompacto('Álgebra Lineal'), 'AL');
  assert.equal(nombreCompacto('Cálculo Integral'), 'CI');
  assert.equal(nombreCompacto('Introducción a la Administración de Sistemas Distribuidos'), 'IALADSD');
  assert.equal(nombreCompacto('Programación II'), 'PII');
  assert.equal(nombreCompacto('  Física   10  '), 'F10');
  assert.equal(nombreCompacto(''), '');
});

test('el resumen compacto conserva sección, tipo y estado sin inventar una sala', async () => {
  const { resumenCompacto } = await import('./presentacion.ts');
  const sesion = { seccion: 1, tipoHora: { tipo: 'Teórica' }, estadoSala: 'externa' };
  assert.equal(resumenCompacto(sesion, 'Horario externo'), 'Sec. 1 · Teo. · H. ext.');
  assert.equal(resumenCompacto({ ...sesion, seccion: 10, tipoHora: { tipo: 'Práctica' }, estadoSala: 'pendiente' }, 'Sala pendiente'), 'Sec. 10 · Prác. · Pend. sala');
  assert.equal(resumenCompacto({ ...sesion, estadoSala: 'asignada' }, 'A101'), 'Sec. 1 · Teo. · A101');
  assert.equal(resumenCompacto({ ...sesion, tipoHora: { tipo: 'Seminario' }, estadoSala: 'noRequiere' }, 'No requiere sala'), 'Sec. 1 · Seminario · No requiere');
});

test('la sala o su estado siempre ocupa una línea propia debajo de sección y tipo', async () => {
  const { lineasCompactas } = await import('./presentacion.ts');
  const sesion = { seccion: 1, tipoHora: { tipo: 'Teórica' }, estadoSala: 'externa' };
  assert.deepEqual(lineasCompactas(sesion, 'Horario externo'), ['Sec. 1 · Teo.', 'H. ext.']);
  assert.deepEqual(lineasCompactas({ ...sesion, estadoSala: 'asignada' }, 'A101'), ['Sec. 1 · Teo.', 'A101']);
  assert.deepEqual(lineasCompactas({ ...sesion, estadoSala: 'pendiente' }, 'Sala pendiente'), ['Sec. 1 · Teo.', 'Pend. sala']);
  assert.deepEqual(lineasCompactas({ ...sesion, estadoSala: 'asignada' }, 'Salas por tramo'), ['Sec. 1 · Teo.', 'Salas por tramo']);
  assert.deepEqual(lineasCompactas({ ...sesion, estadoSala: 'asignada' }, 'A · B'), ['Sec. 1 · Teo.', 'A · B']);
  assert.deepEqual(lineasCompactas({ ...sesion, estadoSala: 'noRequiere' }, 'No requiere sala'), ['Sec. 1 · Teo.', 'No requiere']);
  assert.deepEqual(lineasCompactas({ ...sesion, tipoHora: { tipo: 'Laboratorio' }, estadoSala: 'laboratorio' }, 'Laboratorio'), ['Sec. 1 · Lab.', 'Lab.']);
});
