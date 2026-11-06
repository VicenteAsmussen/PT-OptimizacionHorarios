import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('las tablas conservan filas, scroll por teclado e identificación fija en anchos estrechos', async () => {
  for (const [estilo, componente] of [
    ['../profesores/Profesores.module.css', '../profesores/TablaProfesores.tsx'],
    ['./Asignaturas.module.css', './AsignaturasPage.tsx'],
  ]) {
    const css = await readFile(new URL(estilo, import.meta.url), 'utf8');
    const fuente = await readFile(new URL(componente, import.meta.url), 'utf8');
    assert.match(css, /\.tablaContenedor\s*\{[^}]*overflow-x:\s*auto/);
    assert.match(css, /\.tabla tr > :first-child\s*\{[^}]*position:\s*sticky[^}]*inset-inline-start:\s*0/);
    assert.match(css, /\.tabla tbody tr:focus-within > \*\s*\{[^}]*background:/);
    assert.match(css, /\.tablaContenedor\s*\{[^}]*scroll-padding-inline-start:/);
    assert.match(fuente, /tabIndex=\{0\} role="region"/);
    assert.match(fuente, /aria-describedby=\{desborda \? 'ayuda-tabla-/);
    assert.match(fuente, /onFocusCapture=\{mantenerFocoEnTabla\}/);
    assert.match(fuente, /\{desborda && <p id="ayuda-tabla-/);
    assert.match(fuente, /Desplaza la tabla para ver más columnas/);
    assert.match(fuente, /usa las flechas del teclado/);
    assert.match(fuente, /ref=\{referencia\}/);
    assert.doesNotMatch(css, /display:\s*none/);
  }
});
