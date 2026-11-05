import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';
import { ordenarPeriodosPorFechaAcademica } from './periodos.ts';

test('los períodos se ordenan por año y semestre descendentes, no por ID, creación ni marca actual', () => {
  const periodos = [
    { id: 90, codigo: '2025-2', actual: true, creadoEn: '2029-01-01' },
    { id: 2, codigo: '2027-1', actual: false, creadoEn: '2025-01-01' },
    { id: 1, codigo: '2026-2', actual: false, creadoEn: '2024-01-01' },
    { id: 100, codigo: '2026-1', actual: false, creadoEn: '2030-01-01' },
  ];
  assert.deepEqual(ordenarPeriodosPorFechaAcademica(periodos).map(periodo => periodo.codigo),
    ['2027-1', '2026-2', '2026-1', '2025-2']);
});

test('ordenar períodos no muta la entrada y conserva identidad y orden de carreras con igual código', () => {
  const periodos = Object.freeze([
    Object.freeze({ id: 80, codigo: '2026-1', carreraId: 2 }),
    Object.freeze({ id: 1, codigo: '2026-2', carreraId: 1 }),
    Object.freeze({ id: 70, codigo: '2026-1', carreraId: 1 }),
  ]);
  const ordenados = ordenarPeriodosPorFechaAcademica(periodos);
  assert.deepEqual(ordenados, [periodos[1], periodos[0], periodos[2]]);
  assert.equal(ordenados[0], periodos[1]);
  assert.deepEqual(periodos.map(periodo => periodo.id), [80, 1, 70]);
  assert.deepEqual(ordenarPeriodosPorFechaAcademica([]), []);
});

const selectores = [
  '../features/asignaturas/AsignaturasPage.tsx',
  '../features/seguimiento-disponibilidad/SeguimientoDisponibilidadPage.tsx',
  '../features/disponibilidad/DisponibilidadPage.tsx',
  '../features/mi-horario/EncabezadoMiHorario.tsx',
  '../features/optimizacion/OptimizacionPage.tsx',
  '../features/resultados-horarios/ResultadosHorariosPage.tsx',
  '../features/horarios-externos/HorariosExternosPage.tsx',
];

for (const ruta of selectores) {
  test(`${ruta}: las opciones muestran primero el año-semestre más reciente sin cambiar el valor seleccionado`, async () => {
    const fuente = await readFile(new URL(ruta, import.meta.url), 'utf8');
    const archivo = ts.createSourceFile(ruta, fuente, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    let expresion;
    function visitar(nodo) {
      if (ts.isJsxExpression(nodo) && nodo.expression && ts.isCallExpression(nodo.expression)) {
        const texto = nodo.expression.getText(archivo);
        if (texto.includes('<option') && texto.includes('.codigo')) expresion ??= texto;
      }
      ts.forEachChild(nodo, visitar);
    }
    visitar(archivo);
    assert.ok(expresion, 'debe existir el listado de opciones de períodos en el componente real');
    const periodos = ['2025-2', '2026-1', '2026-2'].map((codigo, indice) => Object.freeze({
      id: 3 - indice, codigo, actual: true, carrera: { nombre: 'Carrera' }, carreraNombre: 'Carrera',
    }));
    Object.freeze(periodos);
    const codigo = ts.transpileModule(`return <select value={3} onChange={() => {}}>{${expresion}}</select>;`, {
      compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    const contexto = {
      datos: { planificaciones: periodos }, planificaciones: periodos, disponibles: periodos,
      ordenarPeriodosPorFechaAcademica, estadoSecciones: () => ({ etiqueta: 'Preparación' }), etiquetaEstado: () => 'Preparación',
    };
    const elemento = new Function('React', ...Object.keys(contexto), codigo)(React, ...Object.values(contexto));
    const html = renderToStaticMarkup(elemento);
    const opciones = [...html.matchAll(/<option\b([^>]*)>([^<]*)<\/option>/g)];
    assert.deepEqual(opciones.map(opcion => opcion[2].match(/\d{4}-[12]/)?.[0]), ['2026-2', '2026-1', '2025-2']);
    assert.match(opciones[2][1], /value="3"/);
    assert.match(opciones[2][1], /selected=""/);
    assert.deepEqual(periodos.map(periodo => periodo.codigo), ['2025-2', '2026-1', '2026-2']);
  });
}
