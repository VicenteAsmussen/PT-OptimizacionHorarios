import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';
import { ordenarPeriodosPorFechaAcademica } from '../../lib/periodos.ts';
import { departamentosExternos, presentacionCobertura } from './datos.ts';

const estilos = new Proxy({}, { get: (_, nombre) => String(nombre) });
const planificacion = { id: 7, actual: true, carreraId: 1, codigo: '2026-2', estadoPlanificacion: 'preparacion', carrera: { nombre: 'Carrera de prueba' } };
const departamento = { id: 2, nombre: 'Departamento de prueba', carreraDepartamentos: [{ carreraId: 1, esGestionado: false }] };
const cobertura = [{ codigo: 'MAT101', nombre: 'Matemática', semestreMalla: 2, secciones: [1], estado: 'cargada' }];

async function vista({ seleccionado = 2, resultado = null, rechazado = false, desborda = false, bloqueado = false } = {}) {
  const fuente = await readFile(new URL('./HorariosExternosPage.tsx', import.meta.url), 'utf8');
  const componente = fuente.slice(fuente.indexOf('function PaginaImportacion()'));
  const valores = [{ planificaciones: [planificacion], departamentos: [departamento] }, '', 0, 7,
    seleccionado, cobertura, '', null, false, false, resultado, [], '', rechazado, 0, ''];
  let indice = 0;
  const dependencias = { React, useState: () => [valores[indice++], () => {}], useEffect() {},
    useMemo: calcular => calcular(), useRef: valor => ({ current: valor }),
    useDesbordamientoTabla: () => ({ referencia() {}, desborda }),
    ordenarPeriodosPorFechaAcademica, departamentosExternos, presentacionCobertura,
    useBloqueoOptimizacion: () => bloqueado, AvisoBloqueo: () => null, IconoArchivo: () => null,
    ResumenDepartamentos: () => React.createElement('p', null, 'Resumen global'), base: estilos, estilos };
  const codigo = ts.transpileModule(componente, { compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 } }).outputText;
  const Pagina = new Function(...Object.keys(dependencias), `${codigo}; return PaginaImportacion;`)(...Object.values(dependencias));
  return renderToStaticMarkup(React.createElement(Pagina));
}

test('la carga separa contexto y departamento y agrupa archivo, efecto y acción principal', async () => {
  const html = await vista();
  assert.match(html, /aria-labelledby="titulo-contexto-carga"/);
  assert.ok(html.indexOf('titulo-contexto-carga') < html.indexOf('Departamento externo'));
  assert.match(html, /class="cuerpoCarga"/);
  assert.match(html, /class="pieCarga"[^]*id="efecto-importacion"[^]*type="checkbox"[^]*accionPrincipal/);
  assert.match(html, /Se eliminan las secciones ausentes, también las de asignaturas del otro semestre/);
  assert.match(html, /aria-describedby="efecto-importacion"/);
  assert.doesNotMatch(html, /<dialog|beforeunload/);
});

test('la cobertura distingue archivo rechazado y carga guardada con estados explícitos y ayuda solo si desborda', async () => {
  const guardada = await vista();
  assert.match(guardada, /class="cabeceraResultado"[^]*Carga guardada/);
  assert.doesNotMatch(guardada, /id="ayuda-cobertura-externa"/);
  const rechazada = await vista({ resultado: { cobertura }, rechazado: true, desborda: true });
  assert.match(rechazada, /Resultado del archivo/);
  assert.match(rechazada, /Ninguna fila del archivo se guardó/);
  assert.match(rechazada, /<span class="verde">[^<]*sin guardar/);
  assert.match(rechazada, /aria-describedby="ayuda-cobertura-externa"/);
  assert.match(rechazada, /Con la tabla enfocada, usa las flechas del teclado/);
});

test('el rediseño conserva período fijo, confirmación, bloqueo de importación y resumen condicional', async () => {
  const html = await vista({ bloqueado: true });
  assert.match(html, /<select disabled=""[^]*value="7"/);
  assert.match(html, /<fieldset disabled=""/);
  assert.match(html, /type="submit" disabled=""/);
  assert.doesNotMatch(html, /Resumen global/);
  assert.match(await vista({ seleccionado: null }), /Resumen global/);
});

test('las tablas estrechas conservan enteros los números de fila y no superponen Código al estado', async () => {
  const css = await readFile(new URL('./HorariosExternos.module.css', import.meta.url), 'utf8');
  assert.match(css, /\.errores tr > :nth-child\(2\)\s*\{[^}]*min-width:\s*4rem;[^}]*white-space:\s*nowrap;/);
  assert.match(css, /@media \(max-width: 40rem\)[^]*\.tablaCobertura tr > :first-child\s*\{[^}]*position:\s*static;/);
  assert.match(await vista(), /aria-label="Cobertura de asignaturas"/);
});

test('la cobertura describe el otro semestre sin llamar opcionales a las asignaturas', async () => {
  for (const sinGuardar of [false, true]) {
    assert.deepEqual(presentacionCobertura('faltante_opcional', sinGuardar), { color: 'amarillo', texto: 'Otro semestre, sin carga' });
  }
  const html = await vista({ resultado: { cobertura: [{ ...cobertura[0], estado: 'faltante_opcional', secciones: [] }] } });
  assert.match(html, /Otro semestre, sin carga/);
  assert.match(html, /1 de otro semestre sin carga/);
  assert.match(html, /Los demás corresponden al otro semestre del año/);
  assert.doesNotMatch(html, /opcional/i);
});
