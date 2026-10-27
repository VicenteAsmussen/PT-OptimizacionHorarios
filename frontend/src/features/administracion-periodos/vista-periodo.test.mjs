import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

async function cargarVista(archivo = './VistaPeriodo.tsx') {
  const ts = await import('typescript');
  const resolver = createRequire(import.meta.url);
  let fuente = await readFile(new URL(archivo, import.meta.url), 'utf8');
  fuente = fuente.replace(/^import .* from '([^']+)';$/gm, (linea, ruta) => {
    if (linea.startsWith('import type')) return '';
    if (ruta.endsWith('.css')) return `const ${linea.split(' ')[1]} = {};`;
    if (ruta === 'react') return linea.replace("'react'", JSON.stringify(pathToFileURL(resolver.resolve('react')).href));
    if (ruta === 'react-router-dom') return 'const Navigate = () => null; const Outlet = () => null;';
    if (ruta === '../../hooks/useAuth') return 'const useAuth = () => ({ usuario: { id: 1, rol: "admin" } });';
    if (ruta === './administracion-periodos.api') return 'const servicio = {};';
    if (ruta === './VistaPeriodo') return 'const VistaPeriodo = () => null;';
    if (ruta === './modelo') return linea.replace("'./modelo'", JSON.stringify(new URL('./modelo.ts', import.meta.url).href));
    throw new Error(`Unexpected import: ${ruta}`);
  });
  fuente = `import React from ${JSON.stringify(pathToFileURL(resolver.resolve('react')).href)};\n${fuente}`;
  const codigo = ts.transpileModule(fuente, { compilerOptions: { jsx: ts.JsxEmit.React, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  return (await import(`data:text/javascript;base64,${Buffer.from(codigo).toString('base64')}`)).default;
}
const planificacion = { id: 7, codigo: '2099-2', estadoPlanificacion: 'publicado', carrera: { id: 1, nombre: 'Career A' } };
const resumenes = Object.fromEntries(['gestionadas', 'externas', 'todas'].map(alcance => [alcance, {
  planificacion, alcance, ofertas: alcance === 'todas' ? 4 : 2, asignaciones: alcance === 'todas' ? 4 : 2,
  horarios: alcance === 'todas' ? 8 : 4, huella: 'a'.repeat(64),
}]));
const propiedades = { resumenes, nuevoEstado: 'preparacion', accion: null, confirmacion: '', bloqueado: false,
  alNuevoEstado() {}, alSeleccionarAccion() {}, alConfirmacion() {}, alReiniciar() {}, alCancelar() {}, alCambiarEstado() {} };
function nodos(elemento) {
  if (!elemento || typeof elemento !== 'object') return [];
  return [elemento, ...React.Children.toArray(elemento.props?.children).flatMap(nodos)];
}
test('state and reset cards render short guidance and four explicit actions, with no scope selector', async () => {
  const Vista = await cargarVista();
  const html = renderToStaticMarkup(React.createElement(Vista, propiedades));
  assert.equal((html.match(/<section/g) ?? []).length, 2);
  assert.equal((html.match(/<select/g) ?? []).length, 1, 'only the state select remains');
  for (const texto of ['Reiniciar ofertas gestionadas', 'Reiniciar ofertas externas', 'Reiniciar horarios gestionados', 'Reiniciar horarios externos']) assert.ok(html.includes(texto));
  assert.doesNotMatch(html, /Alcance del reinicio|Todas las ofertas/);
  assert.match(html, /<option value="preparacion" disabled=""/);
  assert.match(html, /elimina.*horarios/i);
});
test('each reset button selects exactly its own target and scope before confirmation', async () => {
  const Vista = await cargarVista();
  const seleccionadas = [];
  const { accionesReinicio } = await import('./modelo.ts');
  for (const accion of accionesReinicio) {
    const datos = structuredClone(resumenes); datos[accion.alcance].horarios = accion.objetivo === 'ofertas' ? 0 : 4;
    const elementos = nodos(Vista({ ...propiedades, resumenes: datos, alSeleccionarAccion: accion => seleccionadas.push([accion.objetivo, accion.alcance]) }));
    const boton = elementos.find(elemento => elemento.type === 'button' && elemento.props.children === accion.etiqueta);
    assert.equal(boton.props.disabled, false); boton.props.onClick();
  }
  assert.deepEqual(seleccionadas, [['horarios', 'gestionadas'], ['horarios', 'externas'], ['ofertas', 'gestionadas'], ['ofertas', 'externas']]);
});
test('external deletion confirmation binds the selected action and exact period code', async () => {
  const Vista = await cargarVista();
  const { accionesReinicio } = await import('./modelo.ts');
  const accion = accionesReinicio.find(accion => accion.objetivo === 'ofertas' && accion.alcance === 'externas');
  let llamadas = 0;
  const datos = structuredClone(resumenes); datos.externas.horarios = 0;
  const crear = confirmacion => Vista({ ...propiedades, resumenes: datos, accion, confirmacion, alReiniciar: () => llamadas++ });
  for (const texto of ['', '2099-1']) {
    const elementos = nodos(crear(texto));
    const formulario = elementos.filter(elemento => elemento.type === 'form').at(-1);
    formulario.props.onSubmit({ preventDefault() {} });
    assert.equal(llamadas, 0);
    assert.equal(elementos.find(elemento => elemento.type === 'button' && elemento.props.children === 'Confirmar reinicio').props.disabled, true);
  }
  const elementos = nodos(crear('2099-2'));
  elementos.filter(elemento => elemento.type === 'form').at(-1).props.onSubmit({ preventDefault() {} });
  assert.equal(llamadas, 1);
  const html = renderToStaticMarkup(crear('2099-2'));
  assert.match(html, /ofertas externas/);
  assert.match(html, /2 ofertas.*2 asignaciones.*0 bloques/);
});

// Boundary probes derived independently during verification.
for (const estado of ['propuesta', 'publicado']) for (const horarios of [0, 1]) for (const destino of ['preparacion', 'propuesta', 'publicado']) {
  test(`state ${estado} -> ${destino}, schedules=${horarios}: selection never writes`, async () => {
    const Vista = await cargarVista(); let mutaciones = 0; let seleccion = '';
    const datos = structuredClone(resumenes);
    datos.todas.planificacion.estadoPlanificacion = estado;
    datos.gestionadas.horarios = horarios;
    const crear = nuevoEstado => nodos(Vista({ ...propiedades, resumenes: datos, nuevoEstado,
      alNuevoEstado: valor => { seleccion = valor; }, alCambiarEstado: () => mutaciones++ }));
    crear(estado).find(elemento => elemento.type === 'select').props.onChange({ target: { value: destino } });
    assert.equal(seleccion, destino); assert.equal(mutaciones, 0);
    crear(destino).find(elemento => elemento.type === 'form').props.onSubmit({ preventDefault() {} });
    assert.equal(mutaciones, estado !== destino && (destino === 'preparacion' ? horarios === 0 : horarios > 0) ? 1 : 0);
  });
}
test('busy confirmation cannot submit any action even with an exact code', async () => {
  const Vista = await cargarVista(); const { accionesReinicio } = await import('./modelo.ts'); let mutaciones = 0;
  for (const accion of accionesReinicio) {
    const elementos = nodos(Vista({ ...propiedades, accion, confirmacion: '2099-2', bloqueado: true, alReiniciar: () => mutaciones++ }));
    elementos.filter(elemento => elemento.type === 'form').at(-1).props.onSubmit({ preventDefault() {} });
    assert.equal(mutaciones, 0);
    assert.equal(elementos.find(elemento => elemento.type === 'button' && elemento.props.children === 'Confirmar reinicio').props.disabled, true);
  }
});
test('preparation remains available with external schedules when managed schedules are zero', async () => {
  const Vista = await cargarVista();
  const datos = structuredClone(resumenes);
  datos.gestionadas.horarios = 0; datos.externas.horarios = 4; datos.todas.horarios = 4;
  let cambios = 0;
  const elemento = Vista({ ...propiedades, resumenes: datos, nuevoEstado: 'preparacion', alCambiarEstado: () => cambios++ });
  const html = renderToStaticMarkup(elemento);
  assert.doesNotMatch(html, /<option value="preparacion" disabled=""/);
  assert.doesNotMatch(html, /elimina primero los horarios/);
  nodos(elemento).find(elemento => elemento.type === 'form').props.onSubmit({ preventDefault() {} });
  assert.equal(cambios, 1);
});
test('external-only schedules cannot publish or be bypassed to reset external offers', async () => {
  const Vista = await cargarVista(); const { accionesReinicio } = await import('./modelo.ts');
  const datos = structuredClone(resumenes); datos.gestionadas.horarios = 0;
  datos.todas.planificacion.estadoPlanificacion = 'propuesta';
  let cambios = 0; let reinicios = 0;
  const elemento = Vista({ ...propiedades, resumenes: datos, nuevoEstado: 'publicado', accion: accionesReinicio.find(accion => accion.objetivo === 'ofertas' && accion.alcance === 'externas'), confirmacion: '2099-2',
    alCambiarEstado: () => cambios++, alReiniciar: () => reinicios++ });
  const html = renderToStaticMarkup(elemento);
  assert.match(html, /<option value="publicado" disabled=""/);
  assert.match(html, /deben existir horarios de las ofertas gestionadas/);
  const elementos = nodos(elemento);
  const oferta = elementos.find(elemento => elemento.type === 'button' && elemento.props.children === 'Reiniciar ofertas externas');
  assert.equal(oferta.props.disabled, true);
  for (const formulario of elementos.filter(elemento => elemento.type === 'form')) formulario.props.onSubmit({ preventDefault() {} });
  assert.equal(cambios, 0); assert.equal(reinicios, 0);
});
test('no managed schedules blocks programmatic proposal submission', async () => {
  const Vista = await cargarVista();
  const datos = structuredClone(resumenes);
  datos.todas.planificacion.estadoPlanificacion = 'preparacion'; datos.gestionadas.horarios = 0;
  let cambios = 0;
  const elementos = nodos(Vista({ ...propiedades, resumenes: datos, nuevoEstado: 'propuesta', alCambiarEstado: () => cambios++ }));
  const boton = elementos.find(elemento => elemento.type === 'button' && elemento.props.children === 'Cambiar estado');
  assert.equal(boton.props.disabled, true);
  elementos.find(elemento => elemento.type === 'form').props.onSubmit({ preventDefault() {} });
  assert.equal(cambios, 0);
});
test('final flow disables both advanced states with external-only schedules and admits admin publishing with managed schedules', async () => {
  const Vista = await cargarVista();
  const datos = structuredClone(resumenes); datos.todas.planificacion.estadoPlanificacion = 'preparacion';
  datos.gestionadas.horarios = 0; datos.externas.horarios = 4; datos.todas.horarios = 4;
  let cambios = 0;
  const crear = nuevoEstado => Vista({ ...propiedades, resumenes: datos, nuevoEstado, alCambiarEstado: () => cambios++ });
  for (const destino of ['propuesta', 'publicado']) {
    nodos(crear(destino)).find(elemento => elemento.type === 'form').props.onSubmit({ preventDefault() {} });
    assert.equal(cambios, 0);
  }
  datos.gestionadas.horarios = 1; datos.todas.horarios = 5;
  nodos(crear('publicado')).find(elemento => elemento.type === 'form').props.onSubmit({ preventDefault() {} });
  assert.equal(cambios, 1);
});
test('card headers show current state and career badges, with concise schedule-before-offer guidance', async () => {
  const Vista = await cargarVista();
  const elemento = Vista(propiedades);
  const html = renderToStaticMarkup(elemento);
  const elementos = nodos(elemento);
  const cabeceras = elementos.filter(elemento => elemento.type === 'header');
  assert.equal(cabeceras.length, 2);
  assert.match(renderToStaticMarkup(cabeceras[0]), /Estado del período[^]*Estado actual:[^]*Publicado/);
  assert.match(renderToStaticMarkup(cabeceras[1]), /Reiniciar datos[^]*Carrera:[^]*Career A/);
  assert.doesNotMatch(html, /Solo afecta a/);
  assert.match(html, /<ol[^]*Orden de reinicio[^]*Reiniciar horarios[^]*Reiniciar ofertas[^]*<\/ol>/);
  assert.match(html, /mismo grupo: gestionadas o externas/);
  assert.match(html, /no se pueden deshacer/);
  const etiquetas = elementos.filter(elemento => elemento.type === 'button' && String(elemento.props.children).startsWith('Reiniciar ')).map(elemento => elemento.props.children);
  assert.deepEqual(etiquetas, ['Reiniciar horarios gestionados', 'Reiniciar horarios externos', 'Reiniciar ofertas gestionadas', 'Reiniciar ofertas externas']);
});
test('page renders its short description immediately below the title', async () => {
  const Pagina = await cargarVista('./AdministracionPeriodosPage.tsx');
  const html = renderToStaticMarkup(React.createElement(Pagina));
  assert.match(html, /<h1[^>]*>Administración de períodos<\/h1><p[^>]*>Selecciona una carrera y un período para cambiar su estado o reiniciar datos\.<\/p>/);
  assert.doesNotMatch(html, /Alcance del reinicio/);
});
