import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';

async function vistaSeguimiento(desborda = false) {
  const fuente = await readFile(new URL('./SeguimientoDisponibilidadPage.tsx', import.meta.url), 'utf8');
  const componente = fuente.slice(fuente.indexOf('function PaginaSeguimiento()'));
  const estilos = new Proxy({}, { get: (_, nombre) => String(nombre) });
  const valores = [[{ id: 7, actual: true, codigo: '2026-2', carrera: { nombre: 'Carrera de prueba' } }], '', 0];
  let indice = 0;
  const { estadoEnvio } = await import('./estado.ts');
  const { ordenarPeriodosPorFechaAcademica } = await import('../../lib/periodos.ts');
  const dependencias = { React, useState: () => [valores[indice++], () => {}], useEffect() {},
    useReducer: () => [{ planificacionId: 7, filas: [
      { profesorId: 1, nombre: 'Profesora de prueba', departamento: { nombre: 'Departamento de prueba' }, enviada: false, bloquesEnviados: 0, minimoBloques: 10 },
      { profesorId: 2, nombre: 'Profesor de prueba', departamento: { nombre: 'Departamento de prueba' }, enviada: true, bloquesEnviados: 12, minimoBloques: 8 },
    ], error: '', revision: 1 }, () => {}], reducirSeguimiento() {}, estadoInicial: {}, estadoEnvio,
    ordenarPeriodosPorFechaAcademica, base: estilos, estilos,
    IconoActualizar: () => null, useDesbordamientoTabla: () => ({ referencia() {}, desborda }) };
  const codigo = ts.transpileModule(componente, { compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 } }).outputText;
  const Pagina = new Function(...Object.keys(dependencias), `${codigo}; return PaginaSeguimiento;`)(...Object.values(dependencias));
  return renderToStaticMarkup(React.createElement(Pagina));
}

test('seguimiento reúne contexto y tabla con pendientes destacados y actualización secundaria', async () => {
  const html = await vistaSeguimiento();
  assert.equal([...html.matchAll(/<section\b/g)].length, 2);
  assert.match(html, /aria-labelledby="titulo-contexto-seguimiento"/);
  assert.match(html, /class="cabeceraResultados"[^]*boton boton--gris/);
  assert.match(html, /<strong class="pendientesResumen">1 sin enviar<\/strong>/);
  assert.match(html, /<span class="pendiente">No enviada<\/span>/);
  assert.match(html, /<span class="enviada">Enviada<\/span>/);
  assert.match(html, /<td>0 /);
  assert.doesNotMatch(html, /id="ayuda-tabla-seguimiento"/);
  assert.match(await vistaSeguimiento(true), /aria-describedby="ayuda-tabla-seguimiento"/);
});

test('los pendientes usan ámbar y los envíos verde sin depender solo del color', async () => {
  const css = await readFile(new URL('./SeguimientoDisponibilidad.module.css', import.meta.url), 'utf8');
  assert.match(css, /\.pendiente\s*\{[^}]*background:\s*#fef3c7;[^}]*color:\s*#713f12;/i);
  assert.match(css, /\.enviada\s*\{[^}]*background:\s*#dcfce7;[^}]*color:\s*#166534;/i);
});

test('el contexto de seguimiento explica el alcance junto al período sin repetirlo en la cabecera', async () => {
  const html = await vistaSeguimiento();
  const contexto = html.match(/<section class="contexto"[^]*?<\/section>/)?.[0];
  assert.ok(contexto);
  assert.match(contexto, /Profesores con carga asignada en el período seleccionado, solo de los departamentos que gestiona tu carrera/);
  assert.match(contexto, /aria-describedby="ayuda-contexto-seguimiento"/);
  assert.equal([...html.matchAll(/departamentos que gestiona tu carrera/g)].length, 1);
});

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
