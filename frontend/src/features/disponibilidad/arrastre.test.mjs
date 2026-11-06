import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { registerHooks } from 'node:module';
import React from 'react';
import * as jsx from 'react/jsx-runtime';
import ts from 'typescript';

registerHooks({ resolve(especificador, contexto, siguiente) {
  if (contexto.parentURL?.includes('/frontend/src/') && especificador.startsWith('.') && !/\.[a-z]+$/i.test(especificador)) {
    return siguiente(`${especificador}.ts`, contexto);
  }
  return siguiente(especificador, contexto);
} });

const bloques = [1, 2, 3, 4].map(id => ({ id, dia: 'Lunes', numeroBloque: id, horaInicio: '08:10', horaTermino: '08:50' }));

async function montar(inicial = {}) {
  const fuente = await readFile(new URL('./GrillaDisponibilidad.tsx', import.meta.url), 'utf8');
  const codigo = ts.transpileModule(fuente, { compilerOptions: {
    jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
  } }).outputText;
  const referencias = [], efectos = [];
  let indice = 0, pendientes = [], arbol;
  const ventanaAnterior = globalThis.window;
  const ventana = new EventTarget();
  globalThis.window = ventana;
  const cambios = [];
  let props = { bloques, bloquesIds: [], bloquesReservadosIds: [], bloqueada: false, guardada: false,
    alternar(id) { cambios.push(id); props = { ...props, bloquesIds: props.bloquesIds.includes(id)
      ? props.bloquesIds.filter(valor => valor !== id) : [...props.bloquesIds, id] }; }, ...inicial };
  const dependencias = {
    react: {
      useRef(inicial) { const lugar = indice++; return referencias[lugar] ??= { current: inicial }; },
      useEffect(efecto, deps) {
        const lugar = indice++;
        const previo = efectos[lugar];
        if (!previo || deps.some((valor, i) => !Object.is(valor, previo.deps[i]))) pendientes.push(() => {
          previo?.limpiar?.(); efectos[lugar] = { deps, limpiar: efecto() };
        });
      },
    },
    'react/jsx-runtime': jsx,
    './estado': { ordenarBloques: lista => lista, claveDia: dia => dia.toLowerCase() },
    './parejas': await import('./parejas.ts'),
    './Disponibilidad.module.css': { default: {} },
  };
  const modulo = { exports: {} };
  new Function('require', 'exports', 'module', codigo)(nombre => dependencias[nombre], modulo.exports, modulo);
  function renderizar(nuevas = {}) { props = { ...props, ...nuevas }; indice = 0;
    arbol = modulo.exports.default(props); pendientes.splice(0).forEach(efecto => efecto()); }
  function botones(nodo = arbol) { return !React.isValidElement(nodo) ? [] : [
    ...(nodo.type === 'button' ? [nodo] : []), ...React.Children.toArray(nodo.props.children).flatMap(botones),
  ]; }
  function puntero(indice, nombre, valores = {}) {
    const evento = { pointerType: 'mouse', pointerId: 1, button: 0, buttons: 1, detail: 1, ...valores };
    assert.equal(typeof botones()[indice].props[nombre], 'function', nombre);
    botones()[indice].props[nombre](evento); renderizar();
  }
  renderizar();
  return { cambios, puntero, renderizar, ids: () => props.bloquesIds,
    terminar(tipo = 'pointerup', pointerId = 1) { ventana.dispatchEvent(Object.assign(new Event(tipo), { pointerId })); },
    cerrar() { efectos.forEach(efecto => efecto?.limpiar?.()); globalThis.window = ventanaAnterior; },
  };
}

test('arrastrar marca sin alternar dos veces ni tocar reservas, el clic final no deshace la selección', async () => {
  const grilla = await montar({ bloquesIds: [2] });
  try {
    grilla.puntero(0, 'onPointerDown');
    grilla.puntero(1, 'onPointerEnter');
    grilla.puntero(2, 'onPointerEnter');
    grilla.puntero(3, 'onPointerEnter');
    grilla.puntero(0, 'onPointerEnter');
    grilla.terminar();
    grilla.puntero(0, 'onClick');
    assert.deepEqual(grilla.ids(), [2, 1, 3, 4]);
    assert.deepEqual(grilla.cambios, [1, 3, 4]);
  } finally { grilla.cerrar(); }
});

test('empezar en marcado desmarca el recorrido y conserva los no seleccionados', async () => {
  const grilla = await montar({ bloquesIds: [1, 2, 4] });
  try {
    grilla.puntero(0, 'onPointerDown'); grilla.puntero(1, 'onPointerEnter');
    grilla.puntero(3, 'onPointerEnter'); grilla.puntero(0, 'onPointerEnter');
    assert.deepEqual(grilla.ids(), []); assert.deepEqual(grilla.cambios, [1, 2, 4]);
  } finally { grilla.cerrar(); }
});

for (const tipo of ['pointerup', 'pointercancel', 'blur']) test(`${tipo} fuera de la grilla termina el gesto`, async () => {
  const grilla = await montar();
  try {
    grilla.puntero(0, 'onPointerDown'); grilla.terminar(tipo);
    grilla.puntero(1, 'onPointerEnter');
    assert.deepEqual(grilla.ids(), [1, 2]);
  } finally { grilla.cerrar(); }
});

test('toque y teclado conservan la activación individual sin pintar al desplazarse', async () => {
  const grilla = await montar();
  try {
    grilla.puntero(0, 'onPointerDown', { pointerType: 'touch' });
    grilla.puntero(1, 'onPointerEnter', { pointerType: 'touch' });
    assert.deepEqual(grilla.ids(), []);
    grilla.puntero(0, 'onClick'); assert.deepEqual(grilla.ids(), [1, 2]);
    grilla.puntero(0, 'onClick', { detail: 0 }); assert.deepEqual(grilla.ids(), []);
    grilla.puntero(1, 'onPointerDown', { button: 2, buttons: 2 });
    assert.deepEqual(grilla.ids(), []);
  } finally { grilla.cerrar(); }
});

for (const indice of [0, 1, 2, 3]) test(`activar el bloque ${indice + 1} alterna su pareja completa`, async () => {
  const grilla = await montar();
  try {
    const esperados = indice < 2 ? [1, 2] : [3, 4];
    grilla.puntero(indice, 'onClick', { detail: 0 });
    assert.deepEqual(grilla.ids(), esperados);
    grilla.puntero(indice, 'onClick', { detail: 0 });
    assert.deepEqual(grilla.ids(), []);
  } finally { grilla.cerrar(); }
});

test('una reserva bloquea ambos lados de la pareja, sin afectar otra pareja', async () => {
  const grilla = await montar({ bloquesReservadosIds: [1] });
  try {
    grilla.puntero(0, 'onClick'); grilla.puntero(1, 'onClick');
    grilla.puntero(1, 'onPointerDown'); grilla.puntero(0, 'onPointerEnter');
    assert.deepEqual(grilla.ids(), []);
    grilla.puntero(3, 'onClick'); assert.deepEqual(grilla.ids(), [3, 4]);
  } finally { grilla.cerrar(); }
});

test('la pareja se busca por día y número, nunca por ID ni cruzando días', async () => {
  const { obtenerPareja, parejaUtilizable } = await import('./parejas.ts');
  const catalogo = [{ ...bloques[0], id: 99 }, { ...bloques[1], id: 2 },
    { ...bloques[0], id: 88, dia: 'Martes' }, { ...bloques[1], id: 7, dia: 'Martes' }];
  assert.deepEqual(obtenerPareja(catalogo, 2).map(b => b.id), [99, 2]);
  assert.deepEqual(obtenerPareja(catalogo, 7).map(b => b.id), [88, 7]);
  assert.equal(parejaUtilizable(catalogo, 2, [99]), false);
  assert.equal(parejaUtilizable(catalogo, 7, [99]), true);
  assert.deepEqual(obtenerPareja([bloques[0]], 1), []);
});

test('bloqueo durante el gesto y reservas nuevas impiden cambios, desbloquear no reanuda el arrastre', async () => {
  const grilla = await montar();
  try {
    grilla.puntero(0, 'onPointerDown');
    grilla.renderizar({ bloquesReservadosIds: [2, 3] });
    grilla.puntero(1, 'onPointerEnter'); assert.deepEqual(grilla.ids(), [1, 2]);
    grilla.renderizar({ bloqueada: true }); grilla.puntero(3, 'onPointerEnter');
    grilla.renderizar({ bloqueada: false }); grilla.puntero(3, 'onPointerEnter');
    assert.deepEqual(grilla.ids(), [1, 2]);
  } finally { grilla.cerrar(); }
});

test('las horas comunes se muestran una vez y las distintas conservan el horario de cada celda', async () => {
  const { createServer } = await import('vite');
  const { renderToStaticMarkup } = await import('react-dom/server');
  const servidor = await createServer({ envFile: false, server: { middlewareMode: true }, appType: 'custom' });
  try {
    const { default: Grilla } = await servidor.ssrLoadModule('/src/features/disponibilidad/GrillaDisponibilidad.tsx');
    const propiedades = { bloques: [bloques[0], { ...bloques[0], id: 5, dia: 'Martes' }], bloquesIds: [],
      bloqueada: false, guardada: false, alternar: () => {} };
    const comunes = renderToStaticMarkup(React.createElement(Grilla, propiedades));
    assert.match(comunes, /<th scope="col">Horario<\/th>/);
    const cabecera = comunes.match(/<th scope="row">([^]*?)<\/th>/)[1].replace(/<[^>]*>/g, '');
    assert.equal(cabecera, '08:10–08:50');
    assert.match(comunes, /<th scope="row">[^]*08:10–08:50[^]*<\/th>/);
    assert.doesNotMatch(comunes.match(/<button[^>]*>([^]*?)<\/button>/)[1], /08:10/);
    const distintos = renderToStaticMarkup(React.createElement(Grilla, { ...propiedades,
      bloques: [bloques[0], { ...propiedades.bloques[1], horaInicio: '09:00', horaTermino: '09:40' }] }));
    assert.match(distintos, /<span>08:10–08:50<\/span>/);
    assert.match(distintos, /<span>09:00–09:40<\/span>/);
    const horasDistintas = distintos.match(/<th scope="row">([^]*?)<\/th>/)[1].replace(/<[^>]*>/g, '');
    assert.equal(horasDistintas, '08:10–08:5009:00–09:40');
  } finally { await servidor.close(); }
});
