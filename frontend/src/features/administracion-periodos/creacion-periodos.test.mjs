import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { setImmediate as siguienteTurno } from 'node:timers/promises';
import React from 'react';
import ts from 'typescript';

const carreras = [{ id: 1, nombre: 'Carrera A' }, { id: 2, nombre: 'Carrera sin períodos' }];
const anterior = { id: 7, carreraId: 1, codigo: '2026-2', actual: true, estadoPlanificacion: 'preparacion', carrera: carreras[0] };
const nueva = { id: 8, carreraId: 1, codigo: '2027-1', actual: true, estadoPlanificacion: 'preparacion' };
function nodos(elemento) {
  return elemento && typeof elemento === 'object' ? [elemento, ...React.Children.toArray(elemento.props?.children).flatMap(nodos)] : [];
}
function diferida() { let resolver; const promesa = new Promise(resuelve => { resolver = resuelve; }); return { promesa, resolver }; }

// Exercise page handlers/effects without a DOM dependency; this is not browser proof.
async function montar(servicio, componente = 'PaginaAdministracion', propiedades = {}) {
  const avisos = [];
  const notificaciones = Object.fromEntries(['exito', 'error', 'advertencia'].map(tipo => [tipo, mensaje => avisos.push({ tipo, mensaje })]));
  const celdas = []; let indice = 0; let pendiente = true; let arbol; let desmontado = false; let escriturasTrasSalir = 0;
  const efectos = [];
  const hooks = {
    useState(inicial) {
      const posicion = indice++;
      celdas[posicion] ??= { valor: inicial };
      return [celdas[posicion].valor, valor => {
        if (desmontado) escriturasTrasSalir++;
        const siguiente = typeof valor === 'function' ? valor(celdas[posicion].valor) : valor;
        if (!Object.is(siguiente, celdas[posicion].valor)) { celdas[posicion].valor = siguiente; pendiente = true; }
      }];
    },
    useRef(inicial) { const posicion = indice++; return celdas[posicion] ??= { current: inicial }; },
    useEffect(accion, dependencias) {
      const posicion = indice++; const previa = celdas[posicion];
      if (!previa || dependencias.some((valor, numero) => !Object.is(valor, previa.dependencias[numero]))) {
        const celda = { dependencias }; celdas[posicion] = celda;
        efectos.push(() => { previa?.limpiar?.(); celda.limpiar = accion(); });
      }
    },
  };
  const clave = `__pruebaPeriodos${Math.random().toString(36).slice(2)}`;
  globalThis[clave] = { hooks, servicio, React, notificaciones };
  let fuente = await readFile(new URL('./AdministracionPeriodosPage.tsx', import.meta.url), 'utf8');
  fuente = fuente.replace(/^import .* from '([^']+)';$/gm, (linea, ruta) => {
    if (linea.startsWith('import type')) return '';
    if (ruta.endsWith('.css')) return `const ${linea.split(' ')[1]} = {};`;
    if (ruta === 'react') return `const { useEffect, useRef, useState } = globalThis[${JSON.stringify(clave)}].hooks;`;
    if (ruta === 'react-router-dom') return 'const Navigate = () => null; const Outlet = () => null;';
    if (ruta === '../../hooks/useAuth') return 'const useAuth = () => ({ usuario: { id: 1, rol: "admin" } });';
    if (ruta === './administracion-periodos.api') return `const servicio = globalThis[${JSON.stringify(clave)}].servicio;`;
    if (ruta === '../../lib/notificaciones') return `const notificaciones = globalThis[${JSON.stringify(clave)}].notificaciones;`;
    if (ruta === './VistaPeriodo') return 'const VistaPeriodo = () => null;';
    if (ruta === './SelectorPeriodo') return 'function SelectorPeriodo() { return null; }';
    if (ruta === './modelo') return linea.replace("'./modelo'", JSON.stringify(new URL('./modelo.ts', import.meta.url).href));
    throw new Error(`Unexpected import: ${ruta}`);
  });
  fuente = `const React = globalThis[${JSON.stringify(clave)}].React;\n${fuente}\nexport { PaginaAdministracion, PanelPeriodo };`;
  const codigo = ts.transpileModule(fuente, { compilerOptions: { jsx: ts.JsxEmit.React, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  let Componente;
  try { Componente = (await import(`data:text/javascript;base64,${Buffer.from(codigo).toString('base64')}`))[componente]; }
  finally { delete globalThis[clave]; }
  function dibujar() { indice = 0; pendiente = false; arbol = Componente(propiedades); efectos.splice(0).forEach(accion => accion()); }
  async function estabilizar() { for (let vuelta = 0; vuelta < 15; vuelta++) { if (pendiente && !desmontado) dibujar(); await siguienteTurno(); if (!pendiente || desmontado) break; } }
  await estabilizar();
  return { avisos, estabilizar, nodos: () => nodos(arbol), formulario: () => nodos(arbol).find(nodo => nodo.type === 'form'),
    salir() { desmontado = true; celdas.forEach(celda => celda.limpiar?.()); }, escriturasTrasSalir: () => escriturasTrasSalir };
}
async function pagina(opciones = {}) {
  const llamadas = { crear: [], listar: 0, estados: 0 };
  const servicio = {
    carreras: async () => carreras,
    planificaciones: async () => { llamadas.listar++; return [anterior]; },
    crear: async datos => { llamadas.crear.push(datos); return nueva; },
    resumen: async (_id, alcance) => ({ planificacion: anterior, alcance, horarios: 1, ofertas: 1, asignaciones: 1, huella: 'a'.repeat(64) }),
    cambiarEstado: async () => { llamadas.estados++; }, ...opciones,
  };
  return { vista: await montar(servicio), servicio, llamadas };
}
async function seleccionar(vista, carreraId = '1', codigo = '2027-1') {
  vista.nodos().find(nodo => nodo.type === 'select').props.onChange({ target: { value: carreraId } }); await vista.estabilizar();
  vista.nodos().find(nodo => nodo.type === 'input').props.onChange({ target: { value: codigo } }); await vista.estabilizar();
}
function enviar(vista) { vista.formulario().props.onSubmit({ preventDefault() {} }); }
function selector(vista) { return vista.nodos().find(nodo => nodo.type?.name === 'SelectorPeriodo'); }
function elegirPeriodo(vista, valor) { selector(vista).props.alSeleccionar(valor); }
function valoresSeleccionados(vista) { return [vista.nodos().find(nodo => nodo.type === 'select').props.value, selector(vista).props.valor]; }
function texto(vista) { return JSON.stringify(vista.nodos().filter(nodo => typeof nodo.type === 'string').map(nodo => nodo.props.children), (_clave, valor) => typeof valor === 'function' ? undefined : valor); }

test('catalog includes careers without periods and keeps the initial choice explicit', async () => {
  const { vista } = await pagina({ planificaciones: async () => [] });
  assert.equal(vista.nodos().find(nodo => nodo.type === 'select').props.value, '');
  assert.ok(vista.nodos().some(nodo => nodo.type === 'option' && nodo.props.children === 'Carrera sin períodos'));
  assert.ok(vista.formulario());
  assert.deepEqual(vista.avisos, []);
  assert.doesNotMatch(texto(vista), /Selecciona la carrera e ingresa|Será el actual|no se copian/);
  const boton = vista.nodos().find(nodo => nodo.type === 'button' && nodo.props.type === 'submit');
  const acciones = vista.nodos().find(nodo => nodo.type === 'div' && React.Children.toArray(nodo.props.children).some(hijo => hijo?.type === 'button' && hijo.props.type === 'submit'));
  assert.ok(nodos(acciones).some(nodo => nodo.type === 'span' && nodo.props.children === 'Se creará como actual.'));
  assert.equal(boton.props.disabled, true);
});
test('creates once, refreshes current markers and selects the created career/period', async () => {
  const solicitud = diferida(); let lecturas = 0; const envios = [];
  const { vista } = await pagina({ crear: datos => { envios.push(datos); return solicitud.promesa; }, planificaciones: async () => ++lecturas === 1 ? [anterior] : [{ ...anterior, actual: false }, { ...nueva, carrera: carreras[0] }] });
  await seleccionar(vista); enviar(vista); enviar(vista); await vista.estabilizar();
  assert.deepEqual(envios, [{ carreraId: 1, codigo: '2027-1' }]);
  assert.ok(vista.nodos().find(nodo => nodo.type === 'fieldset').props.disabled);
  assert.equal(vista.nodos().find(nodo => nodo.type === 'button' && nodo.props.type === 'submit').props.disabled, true);
  assert.deepEqual(vista.avisos, []);
  solicitud.resolver(nueva); await vista.estabilizar();
  assert.equal(lecturas, 2);
  assert.deepEqual(valoresSeleccionados(vista), ['1', '8']);
  assert.equal(vista.nodos().find(nodo => nodo.type === 'input').props.value, '');
  assert.doesNotMatch(texto(vista), /2026-2 \(actual\)/);
  assert.equal(vista.nodos().find(nodo => nodo.type?.name === 'PanelPeriodo').props.planificacion.id, 8);
  assert.deepEqual(vista.avisos, [{ tipo: 'exito', mensaje: 'Período 2027-1 creado como actual y en Preparación para Carrera A.' }]);
  assert.doesNotMatch(texto(vista), /creado como actual/);
});
test('first period may reuse another career code without changing that career current marker', async () => {
  const creada = { ...nueva, carreraId: 2, codigo: anterior.codigo }; let lecturas = 0; const envios = [];
  const { vista } = await pagina({ crear: async datos => { envios.push(datos); return creada; },
    planificaciones: async () => ++lecturas === 1 ? [anterior] : [anterior, { ...creada, carrera: carreras[1] }] });
  await seleccionar(vista, '2', anterior.codigo);
  assert.deepEqual(selector(vista).props.periodos, []);
  enviar(vista); await vista.estabilizar();
  assert.deepEqual(envios, [{ carreraId: 2, codigo: anterior.codigo }]);
  assert.deepEqual(valoresSeleccionados(vista), ['2', '8']);
  await seleccionar(vista, '1');
  const opciones = selector(vista).props.periodos;
  assert.equal(opciones.length, 1); assert.equal(opciones[0].id, 7); assert.equal(opciones[0].actual, true);
});
test('rejects missing career and malformed code without creating a period', async () => {
  const { vista, llamadas } = await pagina(); enviar(vista); await vista.estabilizar();
  for (const [carrera, codigo] of [['', '2027-1'], ['99', '2027-1'], ...['', '2027-3', '2027-1\n', ' 2027-1', '2027-1 ', '２０２７-1', '2027–1'].map(codigo => ['1', codigo])]) {
    await seleccionar(vista, carrera, codigo);
    assert.equal(vista.nodos().find(nodo => nodo.type === 'button' && nodo.props.type === 'submit').props.disabled, true);
    enviar(vista); await vista.estabilizar();
  }
  assert.deepEqual(llamadas.crear, []); assert.deepEqual(vista.avisos, []); assert.equal(llamadas.listar, 1);
  for (const codigo of ['2098-1', '2098-2']) {
    await seleccionar(vista, '1', codigo);
    assert.equal(vista.nodos().find(nodo => nodo.type === 'button' && nodo.props.type === 'submit').props.disabled, false);
  }
});
for (const [status, mensaje] of [[409, 'Período existente'], [500, 'Internal server error']]) test(`relays creation ${status} once and retains code/career without retrying`, async () => {
  let envios = 0;
  const { vista, llamadas } = await pagina({ crear: async () => { envios++; throw Object.assign(new Error(mensaje), { status }); } });
  await seleccionar(vista); enviar(vista); await vista.estabilizar();
  assert.equal(envios, 1); assert.equal(llamadas.listar, 1);
  assert.equal(vista.nodos().find(nodo => nodo.type === 'input').props.value, '2027-1');
  assert.equal(vista.nodos().find(nodo => nodo.type === 'select').props.value, '1');
  assert.deepEqual(vista.avisos, [{ tipo: 'error', mensaje }]);
  assert.ok(!texto(vista).includes(mensaje));
});
test('failed refresh after success preserves known creation and retries GET only', async () => {
  let lecturas = 0;
  const { vista, llamadas } = await pagina({ planificaciones: async () => { if (++lecturas === 2) throw new Error('Lista no disponible'); return lecturas === 1 ? [anterior] : [{ ...anterior, actual: false }, { ...nueva, carrera: carreras[0] }]; } });
  await seleccionar(vista); enviar(vista); await vista.estabilizar();
  assert.equal(llamadas.crear.length, 1); assert.equal(vista.avisos.length, 1); assert.equal(vista.avisos[0].tipo, 'exito'); assert.match(texto(vista), /Lista no disponible/);
  assert.deepEqual(valoresSeleccionados(vista), ['1', '8']);
  assert.doesNotMatch(texto(vista), /2026-2 \(actual\)/);
  const panel = vista.nodos().find(nodo => nodo.type?.name === 'PanelPeriodo'); assert.deepEqual(panel.props.planificacion.carrera, carreras[0]);
  vista.nodos().find(nodo => nodo.type === 'button' && nodo.props.children === 'Actualizar períodos').props.onClick(); await vista.estabilizar();
  assert.equal(llamadas.crear.length, 1); assert.equal(lecturas, 3); assert.doesNotMatch(texto(vista), /Lista no disponible/);
  assert.equal(vista.avisos.length, 1);
});
test('creation and existing state changes share a synchronous lock in both directions', async () => {
  const solicitud = diferida(); const estadoPendiente = diferida(); let envios = 0;
  const { vista, servicio, llamadas } = await pagina({ crear: () => { envios++; return solicitud.promesa; } });
  servicio.cambiarEstado = () => { llamadas.estados++; return estadoPendiente.promesa; };
  await seleccionar(vista);
  elegirPeriodo(vista, '7'); await vista.estabilizar();
  const propiedades = vista.nodos().find(nodo => nodo.type?.name === 'PanelPeriodo').props;
  const panel = await montar(servicio, 'PanelPeriodo', propiedades);
  const resumen = () => panel.nodos().find(nodo => nodo.type?.name === 'VistaPeriodo');
  resumen().props.alNuevoEstado('propuesta'); await panel.estabilizar();
  resumen().props.alCambiarEstado(); enviar(vista); await vista.estabilizar();
  assert.equal(llamadas.estados, 1); assert.equal(envios, 0);
  estadoPendiente.resolver(); await panel.estabilizar();
  resumen().props.alNuevoEstado('propuesta'); await panel.estabilizar();
  elegirPeriodo(vista, ''); await vista.estabilizar();
  vista.nodos().find(nodo => nodo.type === 'input').props.onChange({ target: { value: '2027-1' } }); await vista.estabilizar();
  enviar(vista); resumen().props.alCambiarEstado(); await panel.estabilizar();
  assert.equal(envios, 1); assert.equal(llamadas.estados, 1);
  solicitud.resolver(nueva); await vista.estabilizar();
});
test('title has career only, edit/create are sibling cards with responsive dimmed creation', async () => {
  const { vista, llamadas } = await pagina(); await seleccionar(vista);
  const titulo = vista.nodos().find(nodo => nodo.props['aria-labelledby'] === 'titulo-administracion');
  assert.equal(nodos(titulo).filter(nodo => nodo.type === 'select').length, 1);
  assert.equal(nodos(titulo).filter(nodo => nodo.type === 'form').length, 0);
  assert.ok(vista.nodos().some(nodo => nodo.props['aria-labelledby'] === 'titulo-seleccion'));
  const envioObsoleto = vista.formulario().props.onSubmit;
  elegirPeriodo(vista, '7');
  envioObsoleto({ preventDefault() {} }); await vista.estabilizar();
  assert.equal(llamadas.crear.length, 0);
  assert.deepEqual(vista.avisos, []);
  assert.equal(nodos(vista.formulario()).find(nodo => nodo.type === 'fieldset').props.disabled, true);
  assert.equal(nodos(vista.formulario()).find(nodo => nodo.type === 'button').props.disabled, true);
  assert.ok(vista.nodos().find(nodo => nodo.type?.name === 'PanelPeriodo'));
  elegirPeriodo(vista, ''); await vista.estabilizar();
  assert.equal(nodos(vista.formulario()).find(nodo => nodo.type === 'fieldset').props.disabled, false);
  vista.nodos().find(nodo => nodo.type === 'input').props.onChange({ target: { value: '2027-1' } }); await vista.estabilizar();
  enviar(vista); await vista.estabilizar(); assert.equal(llamadas.crear.length, 1);
  assert.equal(nodos(vista.formulario()).find(nodo => nodo.type === 'fieldset').props.disabled, true);
  const css = await readFile(new URL('./AdministracionPeriodos.module.css', import.meta.url), 'utf8');
  assert.match(css, /\.seleccionCreacion\s*\{[^}]*grid-template-columns:\s*repeat\(2,/);
  assert.match(css, /\.creacionDeshabilitada\s*\{[^}]*background:/);
  assert.match(css, /@media[\s\S]*\.seleccionCreacion[^}]*grid-template-columns:\s*minmax\(0, 1fr\)/);
});

async function gestion(opciones = {}) {
  const { vista, servicio, llamadas } = await pagina(opciones); await seleccionar(vista);
  elegirPeriodo(vista, '7'); await vista.estabilizar();
  const propiedades = vista.nodos().find(nodo => nodo.type?.name === 'PanelPeriodo').props;
  const panel = await montar(servicio, 'PanelPeriodo', propiedades);
  return { vista, panel, servicio, llamadas, controles: () => panel.nodos().find(nodo => nodo.type?.name === 'VistaPeriodo').props };
}
test('confirmed state changes refresh selector data without changing current flags or other periods', async () => {
  const historica = { ...anterior, id: 9, codigo: '2025-1', actual: false, estadoPlanificacion: 'publicado' };
  const ajena = { ...anterior, id: 10, carreraId: 2, carrera: carreras[1] };
  let estado = 'preparacion'; let lecturas = 0; const envios = [];
  const { vista, panel, controles } = await gestion({
    planificaciones: async () => { lecturas++; return [anterior, historica, ajena]; },
    resumen: async (_id, alcance) => ({ planificacion: { ...anterior, estadoPlanificacion: estado }, alcance,
      ofertas: 1, horarios: estado === 'publicado' ? 0 : 1, huella: 'a'.repeat(64) }),
    cambiarEstado: async (id, previo, siguiente) => { envios.push([id, previo, siguiente]); estado = siguiente; },
  });
  for (const destino of ['propuesta', 'publicado', 'preparacion']) {
    const previo = estado;
    controles().alNuevoEstado(destino); await panel.estabilizar();
    controles().alCambiarEstado(); await panel.estabilizar(); await vista.estabilizar();
    assert.deepEqual(selector(vista).props.periodos, [{ ...anterior, estadoPlanificacion: destino }, historica]);
    assert.deepEqual(vista.nodos().find(nodo => nodo.type?.name === 'PanelPeriodo').props.planificacion,
      { ...anterior, estadoPlanificacion: destino });
    assert.equal(controles().resumenes.todas.planificacion.estadoPlanificacion, destino);
    assert.deepEqual(envios.at(-1), [7, previo, destino]);
    assert.equal(selector(vista).props.valor, '7');
    assert.equal(vista.nodos().find(nodo => nodo.type === 'fieldset').props.disabled, false);
  }
  assert.equal(lecturas, 1, 'confirmed updates do not require another list request');
  assert.equal(envios.length, 3);
  assert.deepEqual(panel.avisos.map(aviso => aviso.mensaje), ['Estado cambiado a Propuesta.', 'Estado cambiado a Publicado.', 'Estado cambiado a Preparación.']);
  assert.deepEqual(vista.avisos, []);
  vista.nodos().find(nodo => nodo.type === 'select').props.onChange({ target: { value: '2' } }); await vista.estabilizar();
  assert.deepEqual(selector(vista).props.periodos, [ajena]);
});
test('failed or unmounted state changes leave the selector state unconfirmed', async () => {
  for (const falla of [false, true]) {
    const solicitud = diferida();
    const { vista, panel, controles } = await gestion({ cambiarEstado: async () => {
      await solicitud.promesa;
      if (falla) throw new Error('Cambio rechazado');
    } });
    controles().alNuevoEstado('propuesta'); await panel.estabilizar();
    controles().alCambiarEstado(); await panel.estabilizar(); await vista.estabilizar();
    assert.deepEqual(selector(vista).props.periodos, [anterior]);
    if (!falla) panel.salir();
    solicitud.resolver(); await panel.estabilizar(); await vista.estabilizar();
    assert.deepEqual(selector(vista).props.periodos, [anterior]);
    assert.deepEqual(vista.avisos, []);
    assert.equal(panel.escriturasTrasSalir(), 0);
    assert.equal(vista.nodos().find(nodo => nodo.type === 'fieldset').props.disabled, false);
    assert.deepEqual(panel.avisos.map(aviso => aviso.tipo), falla ? ['error'] : []);
  }
});
test('current marking preserves selection/state and refreshes all career badges with GET-only recovery', async () => {
  let lecturas = 0; const envios = [];
  const historica = { ...anterior, actual: false, estadoPlanificacion: 'publicado' };
  const { vista, panel, controles } = await gestion({ planificaciones: async () => { if (++lecturas > 1) throw new Error('GET pendiente'); return [historica]; },
    resumen: async (_id, alcance) => ({ planificacion: historica, alcance, ofertas: 0, horarios: 0, huella: 'a'.repeat(64) }),
    marcarActual: async id => { envios.push(id); return { ...historica, actual: true }; } });
  controles().alMarcarActual(); controles().alMarcarActual(); await panel.estabilizar(); await vista.estabilizar();
  assert.deepEqual(envios, [7]); assert.equal(lecturas, 2);
  const fila = vista.nodos().find(nodo => nodo.type?.name === 'PanelPeriodo').props.planificacion;
  assert.equal(fila.id, 7); assert.equal(fila.actual, true); assert.equal(fila.estadoPlanificacion, 'publicado');
  assert.match(texto(vista), /GET pendiente/);
  vista.nodos().find(nodo => nodo.type === 'button' && nodo.props.children === 'Actualizar períodos').props.onClick(); await vista.estabilizar();
  assert.equal(lecturas, 3); assert.deepEqual(envios, [7]);
  assert.deepEqual(vista.avisos, [{ tipo: 'exito', mensaje: 'Período 2026-2 marcado como actual. Su estado y sus datos se conservan.' }]);
  assert.deepEqual(panel.avisos, []);
  assert.doesNotMatch(texto(vista) + texto(panel), /marcado como actual/);
});
test('delete exact confirmation binds all-scope summary, clears local selection and releases parent lock after child unmount', async () => {
  let lecturas = 0; const envios = []; const lectura = diferida();
  const { vista, panel, controles } = await gestion({ planificaciones: async () => ++lecturas === 1 ? [anterior] : lectura.promesa,
    resumen: async (_id, alcance) => ({ planificacion: anterior, alcance, ofertas: 0, horarios: 0, huella: 'a'.repeat(64) }),
    eliminar: async (id, confirmacion) => { envios.push({ id, confirmacion }); return anterior; } });
  controles().alSolicitarEliminacion(); await panel.estabilizar();
  controles().alConfirmacionEliminacion(' 2026-2'); await panel.estabilizar(); controles().alEliminar();
  assert.deepEqual(envios, []);
  controles().alConfirmacionEliminacion('2026-2'); await panel.estabilizar(); controles().alEliminar(); controles().alEliminar();
  await vista.estabilizar(); assert.deepEqual(envios, [{ id: 7, confirmacion: '2026-2' }]);
  assert.equal(vista.nodos().find(nodo => nodo.type?.name === 'PanelPeriodo'), undefined);
  assert.deepEqual(valoresSeleccionados(vista), ['1', '']);
  assert.doesNotMatch(texto(vista), /2026-2 \(actual\)/);
  panel.salir(); lectura.resolver(Promise.reject(new Error('Lista pendiente'))); await panel.estabilizar(); await vista.estabilizar();
  assert.equal(panel.escriturasTrasSalir(), 0);
  assert.equal(vista.nodos().find(nodo => nodo.type === 'fieldset').props.disabled, false);
  assert.deepEqual(vista.avisos, [{ tipo: 'exito', mensaje: 'Período 2026-2 eliminado. No se ha marcado otro período como actual.' }]);
  assert.deepEqual(panel.avisos, []);
  assert.doesNotMatch(texto(vista) + texto(panel), /Período 2026-2 eliminado/); assert.match(texto(vista), /Lista pendiente/);
  vista.nodos().find(nodo => nodo.type === 'button' && nodo.props.children === 'Actualizar períodos').props.onClick(); await vista.estabilizar();
  assert.equal(envios.length, 1); assert.equal(lecturas, 3);
  assert.equal(vista.avisos.length + panel.avisos.length, 1);
});
test('delete rejects ineligible or mismatched summary even when handler is called directly', async () => {
  for (const cambio of [{ ofertas: 1 }, { planificacion: { ...anterior, estadoPlanificacion: 'propuesta' } }, { planificacion: { ...anterior, estadoPlanificacion: 'publicado' } }, { planificacion: { ...anterior, id: 8 } }]) {
    let envios = 0;
    const { panel, controles } = await gestion({ resumen: async (_id, alcance) => ({ planificacion: anterior, alcance, ofertas: 0, horarios: 0, ...cambio }), eliminar: async () => { envios++; } });
    controles().alSolicitarEliminacion(); await panel.estabilizar();
    controles().alConfirmacionEliminacion('2026-2'); await panel.estabilizar(); controles().alEliminar(); await panel.estabilizar();
    assert.equal(envios, 0);
    assert.deepEqual(panel.avisos, []);
  }
});
test('delete cannot reuse a confirmed callback after input changes or cancellation before render', async () => {
  let envios = 0;
  const { panel, controles } = await gestion({ resumen: async (_id, alcance) => ({ planificacion: anterior, alcance, ofertas: 0, horarios: 0 }), eliminar: async () => { envios++; return anterior; } });
  controles().alSolicitarEliminacion(); await panel.estabilizar();
  controles().alConfirmacionEliminacion('2026-2'); await panel.estabilizar();
  const confirmados = controles(); confirmados.alConfirmacionEliminacion('otro'); confirmados.alEliminar();
  await panel.estabilizar(); assert.equal(envios, 0);
  assert.deepEqual(panel.avisos, []);
  controles().alConfirmacionEliminacion('2026-2'); await panel.estabilizar();
  const obsoletos = controles(); obsoletos.alCancelarEliminacion(); obsoletos.alEliminar();
  await panel.estabilizar(); assert.equal(envios, 0);
});
test('summary retry shares parent lock through its entire read and ignores duplicate callbacks', async () => {
  let lecturas = 0; const pendiente = diferida();
  const { vista, panel } = await gestion({ resumen: async (_id, alcance) => {
    if (++lecturas <= 3) throw new Error('Resumen pendiente');
    await pendiente.promesa; return { planificacion: anterior, alcance, ofertas: 0, horarios: 0 };
  } });
  const reintentar = panel.nodos().find(nodo => nodo.type === 'button').props.onClick;
  reintentar(); reintentar(); await vista.estabilizar();
  assert.equal(lecturas, 6);
  assert.equal(vista.nodos().find(nodo => nodo.type === 'fieldset').props.disabled, true);
  elegirPeriodo(vista, ''); await vista.estabilizar();
  assert.equal(selector(vista).props.valor, '7');
  pendiente.resolver(); await panel.estabilizar(); await vista.estabilizar();
  assert.equal(vista.nodos().find(nodo => nodo.type === 'fieldset').props.disabled, false);
  assert.deepEqual(vista.avisos, []); assert.deepEqual(panel.avisos, []);
});
test('current and deletion successful GET preserve other careers and never activate a deletion replacement', async () => {
  const historica = { ...anterior, actual: false };
  const actual = { ...anterior, id: 9, codigo: '2028-1' };
  const ajena = { ...anterior, id: 10, carreraId: 2, carrera: carreras[1] };
  let filas = [historica, actual, ajena]; let marcas = 0; let eliminaciones = 0;
  const { vista, panel, controles } = await gestion({ planificaciones: async () => filas,
    resumen: async (_id, alcance) => ({ planificacion: filas.find(fila => fila.id === 7), alcance, ofertas: 0, horarios: 0 }),
    marcarActual: async () => { marcas++; filas = [{ ...historica, actual: true }, { ...actual, actual: false }, ajena]; return filas[0]; },
    eliminar: async () => { eliminaciones++; filas = filas.filter(fila => fila.id !== 7); return anterior; } });
  controles().alMarcarActual(); await panel.estabilizar(); await vista.estabilizar();
  assert.equal(marcas, 1); assert.equal(selector(vista).props.valor, '7');
  assert.doesNotMatch(texto(vista), /2028-1 \(actual\)/);
  controles().alSolicitarEliminacion(); await panel.estabilizar(); controles().alConfirmacionEliminacion('2026-2'); await panel.estabilizar();
  controles().alEliminar(); await panel.estabilizar(); await vista.estabilizar();
  assert.equal(eliminaciones, 1); assert.equal(selector(vista).props.valor, '');
  assert.doesNotMatch(texto(vista), /2028-1 \(actual\)/);
  vista.nodos().filter(nodo => nodo.type === 'select')[0].props.onChange({ target: { value: '2' } }); await vista.estabilizar();
  assert.equal(selector(vista).props.periodos[0].codigo, '2026-2');
  assert.equal(selector(vista).props.periodos[0].actual, true);
});
test('late create response after navigation does not update unmounted page state', async () => {
  const solicitud = diferida(); const { vista } = await pagina({ crear: () => solicitud.promesa });
  await seleccionar(vista); enviar(vista); vista.salir(); solicitud.resolver(nueva); await vista.estabilizar();
  assert.equal(vista.escriturasTrasSalir(), 0);
  assert.deepEqual(vista.avisos, []);
});

test('initial load failure stays inline with retry and never notifies', async () => {
  let lecturas = 0;
  const { vista } = await pagina({ carreras: async () => { if (++lecturas === 1) throw new Error('Catálogo no disponible'); return carreras; } });
  assert.match(texto(vista), /Catálogo no disponible/); assert.deepEqual(vista.avisos, []);
  vista.nodos().find(nodo => nodo.type === 'button' && nodo.props.children === 'Reintentar').props.onClick(); await vista.estabilizar();
  assert.ok(vista.formulario()); assert.deepEqual(vista.avisos, []);
});

for (const operacion of ['estado', 'reinicio', 'actual', 'eliminar']) for (const falla of [false, true]) {
  test(`${operacion} ${falla ? 'failure' : 'success'} has exactly one notification; failure keeps uncertain-outcome guidance`, async () => {
    const envios = [];
    const historica = { ...anterior, actual: false };
    const mutar = async (...datos) => { envios.push(datos); if (falla) throw new Error('Respuesta no confirmada'); return operacion === 'reinicio' ? { ofertas: 0, asignaciones: 0, horarios: 2 } : { ...historica, actual: true }; };
    const { vista, panel, controles } = await gestion({
      resumen: async (_id, alcance) => ({ planificacion: historica, alcance, ofertas: 0, horarios: operacion === 'eliminar' ? 0 : 2, huella: 'b'.repeat(64) }),
      cambiarEstado: mutar, reiniciar: mutar, marcarActual: mutar, eliminar: mutar,
    });
    assert.deepEqual([...vista.avisos, ...panel.avisos], []);
    if (operacion === 'estado') {
      controles().alNuevoEstado('propuesta'); await panel.estabilizar();
    } else if (operacion === 'reinicio') {
      const { accionesReinicio } = await import('./modelo.ts');
      controles().alSeleccionarAccion(accionesReinicio[0]); await panel.estabilizar();
      controles().alConfirmacion('2026-2'); await panel.estabilizar();
    } else if (operacion === 'eliminar') {
      controles().alSolicitarEliminacion(); await panel.estabilizar();
      controles().alConfirmacionEliminacion('2026-2'); await panel.estabilizar();
    }
    assert.deepEqual([...vista.avisos, ...panel.avisos], []);
    const ejecutar = controles()[{ estado: 'alCambiarEstado', reinicio: 'alReiniciar', actual: 'alMarcarActual', eliminar: 'alEliminar' }[operacion]];
    ejecutar(); ejecutar(); await panel.estabilizar(); await vista.estabilizar();
    assert.equal(envios.length, 1);
    if (operacion === 'estado') assert.deepEqual(envios[0], [7, 'preparacion', 'propuesta']);
    if (operacion === 'reinicio') assert.deepEqual(envios[0], [7, { alcance: 'gestionadas', objetivo: 'horarios', confirmacion: '2026-2', huella: 'b'.repeat(64) }]);
    if (operacion === 'actual') assert.deepEqual(envios[0], [7]);
    if (operacion === 'eliminar') assert.deepEqual(envios[0], [7, '2026-2']);
    const avisos = [...vista.avisos, ...panel.avisos];
    assert.equal(avisos.length, 1); assert.equal(avisos[0].tipo, falla ? 'error' : 'exito');
    if (falla) assert.equal(avisos[0].mensaje, 'Respuesta no confirmada Revisa los datos actualizados antes de reintentar.');
    else assert.equal(avisos[0].mensaje, { estado: 'Estado cambiado a Propuesta.', reinicio: 'Reinicio completado: 0 ofertas, 0 asignaciones y 2 bloques eliminados.', actual: 'Período 2026-2 marcado como actual. Su estado y sus datos se conservan.', eliminar: 'Período 2026-2 eliminado. No se ha marcado otro período como actual.' }[operacion]);
    assert.doesNotMatch(texto(vista) + texto(panel), /Respuesta no confirmada|Reinicio completado:|Estado cambiado a|marcado como actual|Período 2026-2 eliminado/);
  });
}

test('ineligible maintenance and late unmounted outcomes are silent', async () => {
  const solicitud = diferida(); let envios = 0;
  const { vista, panel, controles } = await gestion({ cambiarEstado: () => { envios++; return solicitud.promesa; } });
  controles().alCambiarEstado(); controles().alMarcarActual(); controles().alReiniciar(); controles().alEliminar();
  await panel.estabilizar(); assert.equal(envios, 0); assert.deepEqual(panel.avisos, []);
  controles().alNuevoEstado('propuesta'); await panel.estabilizar(); controles().alCambiarEstado();
  panel.salir(); solicitud.resolver(); await panel.estabilizar(); await vista.estabilizar();
  assert.equal(envios, 1); assert.deepEqual([...vista.avisos, ...panel.avisos], []); assert.equal(panel.escriturasTrasSalir(), 0);
  assert.equal(vista.nodos().find(nodo => nodo.type === 'fieldset').props.disabled, false);
});

test('period selection clears creation code synchronously, clearing keeps it empty, and no explanatory note remains', async () => {
  const { vista, llamadas } = await pagina(); await seleccionar(vista);
  const envioAnterior = vista.formulario().props.onSubmit;
  elegirPeriodo(vista, '7'); envioAnterior({ preventDefault() {} }); await vista.estabilizar();
  assert.equal(vista.nodos().find(nodo => nodo.type === 'input').props.value, '');
  assert.equal(selector(vista).props.valor, '7'); assert.deepEqual(llamadas.crear, []);
  assert.doesNotMatch(texto(vista), /Para crear un período, deja vacía/);
  elegirPeriodo(vista, ''); await vista.estabilizar(); enviar(vista); await vista.estabilizar();
  assert.equal(vista.nodos().find(nodo => nodo.type === 'input').props.value, '');
  assert.equal(selector(vista).props.valor, ''); assert.deepEqual(llamadas.crear, []); assert.deepEqual(vista.avisos, []);
  vista.nodos().find(nodo => nodo.type === 'input').props.onChange({ target: { value: '2027-1' } }); await vista.estabilizar();
  const envioObsoleto = vista.formulario().props.onSubmit;
  elegirPeriodo(vista, '7'); elegirPeriodo(vista, ''); envioObsoleto({ preventDefault() {} }); await vista.estabilizar();
  assert.equal(vista.nodos().find(nodo => nodo.type === 'input').props.value, '');
  assert.equal(selector(vista).props.valor, ''); assert.deepEqual(llamadas.crear, []); assert.deepEqual(vista.avisos, []);
});

test('custom period selector retains explicit career isolation and stale callbacks cannot bypass locks or career changes', async () => {
  const solicitud = diferida(); const envios = [];
  const { vista } = await pagina({ crear: datos => { envios.push(datos); return solicitud.promesa; } });
  assert.equal(selector(vista).props.valor, ''); assert.equal(selector(vista).props.deshabilitado, true);
  assert.deepEqual(selector(vista).props.periodos, []);
  await seleccionar(vista); const anteriorSeleccion = selector(vista).props.alSeleccionar;
  assert.equal(vista.nodos().filter(nodo => nodo.type === 'select').length, 1);
  assert.deepEqual(selector(vista).props.periodos, [anterior]);
  elegirPeriodo(vista, '999'); await vista.estabilizar(); assert.equal(selector(vista).props.valor, '');
  enviar(vista); anteriorSeleccion('7'); await vista.estabilizar();
  assert.equal(selector(vista).props.deshabilitado, true); assert.equal(selector(vista).props.valor, '');
  solicitud.resolver(nueva); await vista.estabilizar();
  vista.nodos().find(nodo => nodo.type === 'select').props.onChange({ target: { value: '2' } });
  anteriorSeleccion('7'); await vista.estabilizar();
  assert.deepEqual(valoresSeleccionados(vista), ['2', '']); assert.deepEqual(selector(vista).props.periodos, []);
  assert.deepEqual(envios, [{ carreraId: 1, codigo: '2027-1' }]); assert.equal(vista.avisos.length, 1);
});
