import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';

test('los iconos de archivo usan los SVG proporcionados, color heredado y decoración accesible', async () => {
  const servidor = await createServer({ envFile: false, server: { middlewareMode: true }, appType: 'custom' });
  try {
    const { default: IconoArchivo } = await servidor.ssrLoadModule('/src/components/IconoArchivo.tsx');
    for (const tipo of ['importar', 'exportar', 'publicar']) {
      const html = renderToStaticMarkup(createElement(IconoArchivo, { tipo }));
      assert.match(html, /aria-hidden="true"/);
      const recurso = await servidor.ssrLoadModule(`/src/assets/iconos/${tipo}-archivo.svg`);
      const icono = IconoArchivo({ tipo });
      assert.equal(icono.props.style.maskImage, `url("${recurso.default}")`);
      assert.equal(icono.props.style.WebkitMaskImage, icono.props.style.maskImage);
      assert.match(html, /mask-image:/);
      assert.doesNotMatch(html, /tabindex|role="button"|<button/);
    }
    const css = await readFile(new URL('./IconoActualizar.module.css', import.meta.url), 'utf8');
    assert.match(css, /width:\s*1rem/);
    assert.match(css, /height:\s*1rem/);
    assert.match(css, /background-color:\s*currentColor/);
    assert.match(css, /margin-inline-end:\s*0\.5rem/);
  } finally { await servidor.close(); }
});

test('salas y horarios externos incorporan los iconos sin sustituir las etiquetas de acción', async () => {
  const salas = await readFile(new URL('../features/resultados-horarios/GestionSalas.tsx', import.meta.url), 'utf8');
  for (const etiqueta of ['Exportar solicitud', 'Exportar pendiente']) {
    assert.ok(salas.includes(`<IconoArchivo tipo="exportar" />${etiqueta}`));
  }
  assert.ok(salas.includes('<IconoArchivo tipo="importar" />Importar respuesta'));
  const externos = await readFile(new URL('../features/horarios-externos/HorariosExternosPage.tsx', import.meta.url), 'utf8');
  assert.match(externos, /<IconoArchivo tipo="importar" \/>\{importando \? 'Importando…' : 'Importar horarios'\}/);
});

test('publicación incorpora el SVG de subir y los semestres permanecen compactos y accesibles', async () => {
  const pagina = await readFile(new URL('../features/resultados-horarios/ResultadosHorariosPage.tsx', import.meta.url), 'utf8');
  const dialogo = await readFile(new URL('../features/resultados-horarios/PublicacionDialogo.tsx', import.meta.url), 'utf8');
  assert.ok(pagina.includes('<IconoArchivo tipo="publicar" />Revisar y publicar'));
  assert.ok(dialogo.includes('<IconoArchivo tipo="publicar" />{ocupado ?'));
  const css = await readFile(new URL('../features/resultados-horarios/ResultadosHorarios.module.css', import.meta.url), 'utf8');
  assert.match(css, /\.semestre\s*\{[^}]*flex:\s*0 0 2\.5rem/);
  assert.match(css, /\.semestre\s*\{[^}]*min-height:\s*2\.5rem/);
  assert.match(pagina, /aria-label=\{`Ver semestre \$\{semestre\}`\} aria-pressed=\{nivel === semestre\}/);
  assert.match(css, /\.semestre:focus-visible\s*\{[^}]*outline:/);
});
