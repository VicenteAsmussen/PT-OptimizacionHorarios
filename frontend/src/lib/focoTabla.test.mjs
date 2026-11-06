import test from 'node:test';
import assert from 'node:assert/strict';
import { mantenerFocoEnTabla } from './focoTabla.ts';

test('el foco desplaza solo lo necesario para no quedar recortado ni bajo la columna fija', () => {
  for (const [izquierda, derecha, esperado] of [[340, 416, 89], [150, 225, -86], [240, 316, 0]]) {
    const columna = { getBoundingClientRect: () => ({ right: 230 }) };
    const objetivo = { getBoundingClientRect: () => ({ left: izquierda, right: derecha }) };
    const contenedor = {
      scrollLeft: 400, clientLeft: 1, clientWidth: 291,
      getBoundingClientRect: () => ({ left: 41 }), querySelector: () => columna,
    };
    mantenerFocoEnTabla({ currentTarget: contenedor, target: objetivo });
    assert.equal(contenedor.scrollLeft, 400 + esperado);
  }
});

test('enfocar la región no cambia el desplazamiento elegido con el teclado', () => {
  const contenedor = { scrollLeft: 300 };
  mantenerFocoEnTabla({ currentTarget: contenedor, target: contenedor });
  assert.equal(contenedor.scrollLeft, 300);
});
