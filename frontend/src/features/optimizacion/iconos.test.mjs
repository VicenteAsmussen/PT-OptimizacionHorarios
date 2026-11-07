import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';

test('iconos del modelo reutilizan ojo y ejecutar proporcionados como decoración de color heredado', async () => {
  const servidor = await createServer({ envFile: false, server: { middlewareMode: true }, appType: 'custom' });
  try {
    const { default: IconoModelo } = await servidor.ssrLoadModule('/src/features/optimizacion/IconoModelo.tsx');
    for (const [tipo, archivo] of [['ver', 'ojo'], ['ejecutar', 'ejecutar-modelo']]) {
      const recurso = await servidor.ssrLoadModule(`/src/assets/iconos/${archivo}.svg`);
      const icono = IconoModelo({ tipo });
      assert.equal(icono.props.style.maskImage, `url("${recurso.default}")`);
      assert.equal(icono.props.style.WebkitMaskImage, icono.props.style.maskImage);
      const html = renderToStaticMarkup(createElement(IconoModelo, { tipo }));
      assert.match(html, /aria-hidden="true"/);
      assert.doesNotMatch(html, /tabindex|role="button"|<button/);
    }
  } finally { await servidor.close(); }
});

test('ver horario, actualizar e iniciar conservan sus etiquetas junto al icono', async () => {
  const pagina = await readFile(new URL('./OptimizacionPage.tsx', import.meta.url), 'utf8');
  assert.ok(pagina.includes('<IconoModelo tipo="ver" />Ver horario generado'));
  assert.ok(pagina.includes('<IconoActualizar />Actualizar preparación y seguimiento'));
  assert.ok(pagina.includes('<IconoModelo tipo="ejecutar" />{estado?.enviando ?'));
  const seguimiento = await readFile(new URL('./SeguimientoOptimizacion.tsx', import.meta.url), 'utf8');
  assert.match(seguimiento, /aviso\.estado === 'aplicada' && <IconoModelo tipo="ver"/);
  const css = await readFile(new URL('./optimizacion.css', import.meta.url), 'utf8');
  assert.match(css, /\.aviso-optimizacion \.enlace-modelo\s*\{[^}]*display:\s*inline-flex/);
});
