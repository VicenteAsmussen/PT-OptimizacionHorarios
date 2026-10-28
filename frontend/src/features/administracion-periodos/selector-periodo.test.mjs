import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';

const periodos = ['preparacion', 'propuesta', 'publicado'].map((estadoPlanificacion, indice) => ({
  id: indice + 7, codigo: `209${indice}-1`, estadoPlanificacion, actual: indice === 1, carreraId: 1,
}));
function nodos(elemento) {
  return elemento && typeof elemento === 'object' ? [elemento, ...React.Children.toArray(elemento.props?.children).flatMap(nodos)] : [];
}
async function cargar(hooks) {
  const clave = `__selector${Math.random().toString(36).slice(2)}`;
  globalThis[clave] = { React, hooks: hooks ?? React };
  let fuente = await readFile(new URL('./SelectorPeriodo.tsx', import.meta.url), 'utf8');
  fuente = fuente.replace(/^import .* from '([^']+)';$/gm, (linea, ruta) => {
    if (linea.startsWith('import type')) return '';
    if (ruta === 'react') return `const { useEffect, useRef, useState, useId } = globalThis[${JSON.stringify(clave)}].hooks;`;
    if (ruta.endsWith('.css')) return `const ${linea.split(' ')[1]} = new Proxy({}, { get: (_, clave) => clave });`;
    if (ruta === './modelo') return linea.replace("'./modelo'", JSON.stringify(new URL('./modelo.ts', import.meta.url).href));
    throw new Error(`Unexpected import: ${ruta}`);
  });
  const codigo = ts.transpileModule(`const React = globalThis[${JSON.stringify(clave)}].React;\n${fuente}`, {
    compilerOptions: { jsx: ts.JsxEmit.React, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  try { return (await import(`data:text/javascript;base64,${Buffer.from(codigo).toString('base64')}`)).default; }
  finally { delete globalThis[clave]; }
}

// Simulated hooks, refs and document events; these checks do not mount a browser DOM.
async function montar(cambios = {}, documento = true, conScroll = true) {
  const celdas = []; const efectos = []; const eventos = new Map(); const seleccionados = [];
  let indice = 0; let pendiente = false; let arbol; let focos = 0; let scrolls = 0;
  let propiedades = { periodos, valor: '', deshabilitado: false, alSeleccionar: valor => seleccionados.push(valor), ...cambios };
  const anterior = globalThis.document;
  if (documento) globalThis.document = {
    addEventListener: (tipo, accion) => eventos.set(tipo, accion),
    removeEventListener: (tipo, accion) => { if (eventos.get(tipo) === accion) eventos.delete(tipo); },
  };
  else delete globalThis.document;
  const hooks = {
    useId() { indice++; return 'periodo-prueba'; },
    useState(inicial) {
      const posicion = indice++; celdas[posicion] ??= { valor: inicial };
      return [celdas[posicion].valor, valor => { celdas[posicion].valor = typeof valor === 'function' ? valor(celdas[posicion].valor) : valor; pendiente = true; }];
    },
    useRef(inicial) { const posicion = indice++; return celdas[posicion] ??= { current: inicial }; },
    useEffect(accion, dependencias) {
      const posicion = indice++; const previa = celdas[posicion];
      if (!previa || dependencias.some((valor, indice) => !Object.is(valor, previa.dependencias[indice]))) {
        const celda = { dependencias }; celdas[posicion] = celda;
        efectos.push(() => { previa?.limpiar?.(); celda.limpiar = accion(); });
      }
    },
  };
  let Selector;
  try { Selector = await cargar(hooks); }
  catch (error) { globalThis.document = anterior; throw error; }
  function dibujar() {
    for (let vuelta = 0; vuelta < 8; vuelta++) {
      indice = 0; pendiente = false; arbol = Selector(propiedades);
      for (const nodo of nodos(arbol)) if (nodo.props.ref) nodo.props.ref.current = {
        contains: destino => destino?.interior === true,
        focus: () => focos++,
        children: nodos(arbol).filter(nodo => nodo.props.role === 'option').map(() => conScroll ? { scrollIntoView: () => scrolls++ } : {}),
      };
      efectos.splice(0).forEach(accion => accion());
      if (!pendiente) break;
    }
  }
  dibujar();
  const boton = () => nodos(arbol).find(nodo => nodo.props.role === 'combobox');
  return {
    nodos: () => nodos(arbol), boton, seleccionados, focos: () => focos, scrolls: () => scrolls,
    dibujar,
    cambiar(cambios) { propiedades = { ...propiedades, ...cambios }; dibujar(); },
    pulsar(tecla) { let prevenido = false; boton().props.onKeyDown({ key: tecla, preventDefault() { prevenido = true; } }); dibujar(); return prevenido; },
    abrir() { boton().props.onClick(); dibujar(); },
    fuera(interior = false) { eventos.get('pointerdown')?.({ target: { interior } }); dibujar(); },
    salir() { celdas.forEach(celda => celda?.limpiar?.()); globalThis.document = anterior; assert.equal(eventos.size, 0); },
  };
}

test('every option shows readable neutral state and only the current option has a separate blue Actual badge', async () => {
  const vista = await montar();
  try {
    assert.equal(vista.boton().props.type, 'button'); assert.equal(vista.boton().props['aria-expanded'], false);
    const etiqueta = vista.nodos().find(nodo => nodo.type === 'label');
    assert.equal(etiqueta.props.htmlFor, vista.boton().props.id); assert.equal(etiqueta.props.children, 'Período');
    vista.abrir(); const opciones = vista.nodos().filter(nodo => nodo.props.role === 'option');
    assert.equal(opciones.length, 4); assert.equal(opciones[0].props.children, 'Selecciona un período');
    for (const [indice, estado] of ['Preparación', 'Propuesta', 'Publicado'].entries()) {
      const html = renderToStaticMarkup(opciones[indice + 1]);
      assert.match(html, new RegExp(`class="[^"]*estadoPeriodo[^"]*"[^>]*>${estado}<`));
      assert.equal((html.match(/class="distintivo"/g) ?? []).length, indice === 1 ? 1 : 0);
      assert.equal(html.includes('Actual'), indice === 1);
      assert.equal(opciones[indice + 1].props['aria-selected'], false);
    }
    assert.equal(opciones[0].props['aria-selected'], true);
    const lista = vista.nodos().find(nodo => nodo.props.role === 'listbox');
    assert.equal(vista.boton().props['aria-controls'], lista.props.id);
    assert.equal(lista.props['aria-labelledby'], etiqueta.props.id);
    const css = await readFile(new URL('./AdministracionPeriodos.module.css', import.meta.url), 'utf8');
    assert.match(css, /\.estadoPeriodo\s*\{[^}]*var\(--color-gris-fondo\)[^}]*var\(--color-gris-texto\)/);
    assert.match(css, /\.listaPeriodos\s*\{[^}]*max-height:[^}]*overflow-y:\s*auto/);
  } finally { vista.salir(); }
});

test('keyboard navigation keeps active option visible, commits only on Enter or Space and allows clearing', async () => {
  const vista = await montar({ valor: '8' });
  try {
    vista.pulsar('ArrowDown');
    const activo = () => vista.nodos().find(nodo => nodo.props.id === vista.boton().props['aria-activedescendant']);
    assert.match(renderToStaticMarkup(activo()), /2091-1/);
    vista.pulsar('ArrowDown'); assert.match(renderToStaticMarkup(activo()), /Publicado/);
    vista.pulsar('ArrowDown'); assert.match(renderToStaticMarkup(activo()), /Publicado/);
    vista.pulsar('ArrowUp'); assert.match(renderToStaticMarkup(activo()), /Propuesta/);
    vista.pulsar('Home'); assert.equal(activo().props.children, 'Selecciona un período');
    vista.pulsar('ArrowUp'); assert.equal(activo().props.children, 'Selecciona un período');
    vista.pulsar('End'); assert.match(renderToStaticMarkup(activo()), /Publicado/);
    assert.deepEqual(vista.seleccionados, []); vista.pulsar('Enter');
    assert.deepEqual(vista.seleccionados, ['9']); assert.equal(vista.boton().props['aria-expanded'], false);
    assert.equal(vista.boton().props['aria-activedescendant'], undefined);
    vista.cambiar({ valor: '9' }); vista.pulsar(' '); vista.pulsar('Home'); vista.pulsar(' ');
    assert.deepEqual(vista.seleccionados, ['9', '']); assert.ok(vista.scrolls() > 0); assert.ok(vista.focos() > 0);
  } finally { vista.salir(); }
});

test('Escape outside and Tab dismiss without selecting; pointer choice retains trigger focus', async () => {
  const vista = await montar();
  try {
    vista.abrir(); vista.pulsar('End'); const antesEscape = vista.focos(); vista.pulsar('Escape');
    assert.equal(vista.boton().props['aria-expanded'], false); assert.deepEqual(vista.seleccionados, []);
    assert.equal(vista.focos(), antesEscape + 1);
    vista.abrir(); vista.fuera(true); assert.equal(vista.boton().props['aria-expanded'], true);
    const focos = vista.focos(); vista.fuera(); assert.equal(vista.boton().props['aria-expanded'], false); assert.equal(vista.focos(), focos);
    vista.abrir(); assert.equal(vista.pulsar('Tab'), false); assert.equal(vista.boton().props['aria-expanded'], false);
    vista.abrir(); const opcion = vista.nodos().filter(nodo => nodo.props.role === 'option')[1];
    let prevenido = false; opcion.props.onMouseDown({ preventDefault() { prevenido = true; } }); assert.equal(prevenido, true);
    opcion.props.onClick(); vista.dibujar(); assert.deepEqual(vista.seleccionados, ['7']); assert.ok(vista.focos() > focos);
  } finally { vista.salir(); }
});

test('disabled and newly busy selector rejects stale option handlers; empty careers still offer explicit clearing', async () => {
  const vista = await montar();
  try {
    vista.abrir(); const obsoleta = vista.nodos().filter(nodo => nodo.props.role === 'option')[1].props.onClick;
    vista.cambiar({ deshabilitado: true }); obsoleta(); vista.abrir(); vista.pulsar('Enter');
    assert.equal(vista.boton().props.disabled, true); assert.equal(vista.boton().props['aria-expanded'], false);
    assert.deepEqual(vista.seleccionados, []);
    vista.cambiar({ deshabilitado: false, periodos: [], valor: '' }); vista.pulsar('End');
    assert.equal(vista.nodos().filter(nodo => nodo.props.role === 'option').length, 1);
    vista.pulsar('Enter'); assert.deepEqual(vista.seleccionados, ['']);
  } finally { vista.salir(); }
});

test('SSR has a labelled collapsed combobox and navigation tolerates absent document and scroll API', async () => {
  const Selector = await cargar();
  const html = renderToStaticMarkup(React.createElement(Selector, { periodos, valor: '8', deshabilitado: false, alSeleccionar() {} }));
  assert.match(html, /role="combobox"/); assert.match(html, /aria-expanded="false"/); assert.match(html, /Propuesta/); assert.match(html, /Actual/);
  assert.doesNotMatch(html, /role="listbox"/);
  const vista = await montar({}, false, false);
  try { vista.pulsar('ArrowUp'); vista.pulsar('End'); vista.pulsar('Enter'); assert.deepEqual(vista.seleccionados, ['9']); }
  finally { vista.salir(); }
});

test('expanded options contribute to page height instead of overflowing the sidebar grid row', async () => {
  const css = await readFile(new URL('./AdministracionPeriodos.module.css', import.meta.url), 'utf8');
  const regla = css.match(/\.listaPeriodos\s*\{([^}]*)\}/)?.[1];
  assert.ok(regla);
  assert.match(regla, /position:\s*static\s*;/);
  assert.doesNotMatch(regla, /(?:^|;)\s*(?:top|bottom|left|right|inset)\s*:/);
  assert.match(regla, /max-height:\s*18rem\s*;/);
  assert.match(regla, /overflow-y:\s*auto\s*;/);
  assert.match(regla, /box-sizing:\s*border-box\s*;/);
});
