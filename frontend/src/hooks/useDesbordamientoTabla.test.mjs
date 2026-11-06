import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

async function preparar() {
  const estados = [];
  let indice = 0;
  let dependencia;
  let limpiar;
  let notificar;
  const observados = [];
  let desconexiones = 0;
  const React = {
    useState(inicial) {
      const actual = indice++;
      if (!(actual in estados)) estados[actual] = inicial;
      return [estados[actual], valor => { estados[actual] = valor; }];
    },
    useEffect(efecto, [elemento]) {
      if (elemento !== dependencia) {
        limpiar?.(); dependencia = elemento; limpiar = efecto();
      }
    },
  };
  class Observador {
    constructor(callback) { notificar = callback; }
    observe(elemento) { observados.push(elemento); }
    disconnect() { desconexiones++; }
  }
  const fuente = await readFile(new URL('./useDesbordamientoTabla.ts', import.meta.url), 'utf8');
  const codigo = ts.transpileModule(fuente, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exportaciones = {};
  new Function('require', 'exports', 'ResizeObserver', codigo)(modulo => {
    assert.equal(modulo, 'react'); return React;
  }, exportaciones, Observador);
  return {
    renderizar() { indice = 0; return exportaciones.useDesbordamientoTabla(); },
    notificar() { notificar(); }, observados,
    desmontar() { limpiar?.(); }, desconexiones: () => desconexiones,
  };
}

test('la ayuda solo aparece cuando hay desbordamiento y responde al tamaño de tabla y contenedor', async () => {
  const vista = await preparar();
  assert.equal(vista.renderizar().desborda, false);
  const tabla = {};
  const contenedor = { clientWidth: 800, scrollWidth: 800, firstElementChild: tabla };
  vista.renderizar().referencia(contenedor);
  vista.renderizar();
  assert.equal(vista.renderizar().desborda, false);
  assert.deepEqual(vista.observados, [contenedor, tabla]);
  contenedor.clientWidth = 320; vista.notificar();
  assert.equal(vista.renderizar().desborda, true);
  contenedor.clientWidth = 1024; vista.notificar();
  assert.equal(vista.renderizar().desborda, false);
  contenedor.scrollWidth = 1200; vista.notificar();
  assert.equal(vista.renderizar().desborda, true);
  vista.desmontar(); assert.equal(vista.desconexiones(), 1);
});

test('al desaparecer la tabla se retira la ayuda y se desconecta el observador anterior', async () => {
  const vista = await preparar();
  vista.renderizar().referencia({ clientWidth: 300, scrollWidth: 800, firstElementChild: {} });
  vista.renderizar();
  assert.equal(vista.renderizar().desborda, true);
  vista.renderizar().referencia(null); vista.renderizar();
  assert.equal(vista.renderizar().desborda, false);
  assert.equal(vista.desconexiones(), 1);
});
