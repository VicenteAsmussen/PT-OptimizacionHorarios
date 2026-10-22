import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('summary reads persisted coverage per external department and counts subjects, not sections', async () => {
  const { cargarResumenDepartamentos, departamentosExternos } = await import('./datos.ts');
  const departamentos = departamentosExternos([
    { id: 6, nombre: 'Matemática', carreraDepartamentos: [{ carreraId: 1, esGestionado: false }] },
    { id: 7, nombre: 'Física', carreraDepartamentos: [{ carreraId: 1, esGestionado: false }] },
    { id: 8, nombre: 'Propio', carreraDepartamentos: [{ carreraId: 1, esGestionado: true }] },
    { id: 9, nombre: 'Otra carrera', carreraDepartamentos: [{ carreraId: 2, esGestionado: false }] },
  ], 1);
  const consultas = [];
  const consultar = async (planificacionId, departamentoId) => {
    consultas.push([planificacionId, departamentoId]);
    return { cobertura: departamentoId === 6 ? [
      { codigo: 'MAT1', estado: 'cargada', secciones: [1, 2, 3] },
      { codigo: 'MAT2', estado: 'cargada', secciones: [1] },
      { codigo: 'MAT3', estado: 'faltante_opcional', secciones: [] },
    ] : [{ codigo: 'FIS1', estado: 'faltante_obligatoria', secciones: [] }] };
  };
  assert.deepEqual(await cargarResumenDepartamentos(2, departamentos, consultar), [
    { departamentoId: 6, nombre: 'Matemática', cargadas: 2, total: 3 },
    { departamentoId: 7, nombre: 'Física', cargadas: 0, total: 1 },
  ]);
  assert.deepEqual(consultas, [[2, 6], [2, 7]]);
  await cargarResumenDepartamentos(3, departamentos, consultar);
  assert.deepEqual(consultas.slice(2), [[3, 6], [3, 7]], 'changing period rereads its persisted state');
  await assert.rejects(cargarResumenDepartamentos(2, departamentos, async () => { throw new Error('Unavailable'); }), /Unavailable/);
});

test('summary renders loaded counts and zero counts, loading and errors distinctly', async () => {
  const ts = await import('typescript');
  const React = await import('react');
  const { renderToStaticMarkup } = await import('react-dom/server');
  const { createRequire } = await import('node:module');
  const { pathToFileURL } = await import('node:url');
  const resolver = createRequire(import.meta.url);
  let fuente = await readFile(new URL('./ResumenDepartamentos.tsx', import.meta.url), 'utf8');
  fuente = fuente.replace(/^import .* from '([^']+)';$/gm, (linea, ruta) => {
    if (ruta === 'react') return linea.replace("'react'", JSON.stringify(pathToFileURL(resolver.resolve('react')).href));
    if (linea.startsWith('import type')) return '';
    if (ruta.endsWith('.css')) return 'const base = {};';
    if (ruta === './datos') return 'const cargarResumenDepartamentos = () => {}; const mensajeErrorCobertura = () => "";';
    if (ruta === './horarios-externos.api') return 'const horariosExternosApi = {};';
    throw new Error(ruta);
  });
  fuente = `import React from ${JSON.stringify(pathToFileURL(resolver.resolve('react')).href)};\n${fuente}`;
  const codigo = ts.transpileModule(fuente, { compilerOptions: { jsx: ts.JsxEmit.React, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  const { VistaResumenDepartamentos: Vista } = await import(`data:text/javascript;base64,${Buffer.from(codigo).toString('base64')}`);
  const renderizar = estado => renderToStaticMarkup(React.createElement(Vista, { estado, alReintentar() {} }));
  const filas = [
    { departamentoId: 6, nombre: 'Matemática', cargadas: 6, total: 6 },
    { departamentoId: 7, nombre: 'Física', cargadas: 0, total: 2 },
  ];
  const html = renderizar({ tipo: 'listo', filas });
  assert.match(html, /Resumen de departamentos externos/);
  assert.match(html, /período actual/);
  assert.doesNotMatch(html, /período seleccionad/);
  assert.match(html, /Matemática/); assert.match(html, /6 de 6/);
  assert.match(html, /Física/); assert.match(html, /0 de 2/);
  assert.match(renderizar({ tipo: 'cargando' }), /role="status"[^]*Cargando/);
  const error = renderizar({ tipo: 'error', mensaje: 'HTTP 404' });
  assert.match(error, /role="alert"/); assert.match(error, /HTTP 404/); assert.match(error, /Reintentar resumen/);
  assert.doesNotMatch(error, /<table/);
  const pagina = await readFile(new URL('./HorariosExternosPage.tsx', import.meta.url), 'utf8');
  assert.match(pagina, /planificacion && departamentoId === null && departamentos\.length > 0 && <ResumenDepartamentos/);
});
