import test from 'node:test';
import assert from 'node:assert/strict';
import { estadoInicial, reducirDisponibilidad, puedeEnviar } from './estado.ts';

test('el sondeo bloquea y libera sin perder el borrador ni modificar lo guardado', () => {
  let estado = reducirDisponibilidad(estadoInicial, { tipo: 'consultar', id: 2 });
  estado = reducirDisponibilidad(estado, { tipo: 'cargada', id: 2, seleccion: {
    planificacionSemestreId: 2, bloquesIds: [1, 2], bloquesReservadosIds: [], minimoBloques: 2, carga: [], editable: true,
  } });
  estado = reducirDisponibilidad(estado, { tipo: 'editar' });
  estado = reducirDisponibilidad(estado, { tipo: 'alternar', id: 3 });
  estado = reducirDisponibilidad(estado, { tipo: 'permiso', id: 2, editable: false, bloqueadaPorOptimizacion: true });
  assert.equal(estado.seleccion.bloqueadaPorOptimizacion, true);
  assert.deepEqual(estado.bloquesIds, [1, 2, 3]); assert.deepEqual(estado.seleccion.bloquesIds, [1, 2]);
  assert.equal(puedeEnviar(estado), false);
  assert.deepEqual(reducirDisponibilidad(estado, { tipo: 'alternar', id: 4 }), estado);
  estado = reducirDisponibilidad(estado, { tipo: 'permiso', id: 2, editable: true, bloqueadaPorOptimizacion: false });
  assert.equal(estado.seleccion.bloqueadaPorOptimizacion, false);
  assert.deepEqual(estado.bloquesIds, [1, 2, 3]); assert.equal(puedeEnviar(estado), true);
});
