import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';
import { puedeEditarAsignaturas } from './datos.ts';

async function renderizarFragmento(patron, contexto) {
  const fuente = await readFile(new URL('./AsignaturasPage.tsx', import.meta.url), 'utf8');
  const fragmento = fuente.match(patron)?.[0];
  assert.ok(fragmento, 'el fragmento debe existir en la página real');
  const codigo = ts.transpileModule(`return (${fragmento});`, {
    compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return renderToStaticMarkup(new Function('React', ...Object.keys(contexto), codigo)(
    { createElement, Fragment: Symbol.for('react.fragment') }, ...Object.values(contexto)));
}

test('la vista oculta edición a secretaría y conserva edición para administración', async () => {
  for (const rol of ['secretaria', 'admin']) {
    const html = await renderizarFragmento(/<div className=\{estilos.acciones\}>\s*\{puedeEditar &&[^]*?<\/div>/, {
      estilos: { botonVer: 'boton-ver-prueba' }, puedeEditar: puedeEditarAsignaturas(rol), iconoVer: 'ojo.svg', a: { nombre: 'Álgebra' },
      planificacion: { id: 1 }, setSeleccion() {},
    });
    assert.equal(html.includes('>Editar</button>'), rol === 'admin');
    assert.equal(html.includes('Ver Álgebra'), rol === 'secretaria');
    assert.equal(html.includes('ojo.svg'), rol === 'secretaria');
    assert.equal(html.includes('boton-ver-prueba'), rol === 'secretaria');
    assert.ok(html.includes('Gestionar secciones'));
  }
});

test('el botón Ver separa el icono y el texto sin cambiar los demás botones', async () => {
  const css = await readFile(new URL('./Asignaturas.module.css', import.meta.url), 'utf8');
  const regla = css.match(/\.botonVer\s*\{([^}]+)\}/)?.[1];
  assert.ok(regla);
  assert.match(regla, /display:\s*inline-flex/);
  assert.match(regla, /align-items:\s*center/);
  assert.match(regla, /gap:\s*0\.5rem/);
});

test('el encabezado Semestre se mantiene en una sola línea', async () => {
  const css = await readFile(new URL('./Asignaturas.module.css', import.meta.url), 'utf8');
  const regla = css.match(/\.tabla th:nth-child\(4\)\s*\{([^}]+)\}/)?.[1];
  assert.ok(regla);
  assert.match(regla, /white-space:\s*nowrap/);
});

test('Código conserva el ancho reducido sin forzar Asignatura sobre las demás columnas', async () => {
  const css = await readFile(new URL('./Asignaturas.module.css', import.meta.url), 'utf8');
  const codigo = css.match(/\.tabla tr > :first-child\s*\{([^}]+)\}/)?.[1];
  const nombre = css.match(/\.tabla tr > :nth-child\(2\)\s*\{([^}]+)\}/)?.[1];
  assert.match(codigo ?? '', /width:\s*6rem/);
  assert.match(codigo ?? '', /min-width:\s*6rem/);
  assert.doesNotMatch(nombre ?? '', /width:\s*100%/);
  const secciones = css.match(/\.tabla tr > :nth-child\(5\)\s*\{([^}]+)\}/)?.[1];
  assert.match(secciones ?? '', /min-width:\s*10rem/);
  assert.match(secciones ?? '', /white-space:\s*nowrap/);
});

test('el selector incorpora grupos para secretaría y conserva cada departamento', async () => {
  for (const rol of ['secretaria', 'admin']) {
    const html = await renderizarFragmento(/<label>Departamento<select[^]*?<\/select><\/label>/, {
      usuario: { rol }, departamento: '', setDepartamento() {},
      datos: { departamentos: [{ id: 7, nombre: 'Departamento de prueba' }] },
    });
    assert.equal(html.includes('Departamentos gestionados'), rol === 'secretaria');
    assert.equal(html.includes('Departamentos no gestionados'), rol === 'secretaria');
    assert.ok(html.includes('Todos los departamentos'));
    assert.ok(html.includes('value="7"'));
  }
});
