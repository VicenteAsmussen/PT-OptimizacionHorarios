import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

async function cargarComponente(archivo, rol) {
  const ts = await import('typescript');
  const resolver = createRequire(import.meta.url);
  let fuente = await readFile(new URL(archivo, import.meta.url), 'utf8');
  fuente = fuente.replace(/^import .* from ["']([^"']+)["'];$/gm, (linea, ruta) => {
    if (ruta === 'react') return linea.replace(/["']react["']/, JSON.stringify(pathToFileURL(resolver.resolve('react')).href));
    if (ruta === 'react-router-dom') return `const Navigate = ({ to }) => React.createElement('span', { 'data-redirect': to });
      const Outlet = () => React.createElement('span', { 'data-outlet': true });
      const NavLink = ({ to, children }) => React.createElement('a', { href: to }, children); const Link = NavLink;`;
    if (ruta.endsWith('/useAuth')) return `const useAuth = () => ({ usuario: { id: 1, nombre: 'Test user', rol: ${JSON.stringify(rol)} }, logout() {} });`;
    if (ruta.endsWith('/mi-horario/modelo')) return 'const puedeConsultarMiHorario = () => false;';
    if (/\.(png|svg)$/.test(ruta)) return `const ${linea.split(' ')[1]} = 'test-image';`;
    if (ruta === './permisos') return linea.replace(/["']\.\/permisos["']/, JSON.stringify(new URL('./permisos.ts', import.meta.url).href));
    return linea.replace(/["']([^"']+)["']/, JSON.stringify(new URL(`${ruta}.ts`, new URL(archivo, import.meta.url)).href));
  });
  fuente = `import React from ${JSON.stringify(pathToFileURL(resolver.resolve('react')).href)};\n${fuente}`;
  const codigo = ts.transpileModule(fuente, { compilerOptions: { jsx: ts.JsxEmit.React, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  return (await import(`data:text/javascript;base64,${Buffer.from(codigo).toString('base64')}`)).default;
}
test('only secretary role receives external schedule management permission', async () => {
  const { puedeGestionarHorariosExternos } = await import('./permisos.ts');
  assert.equal(puedeGestionarHorariosExternos('secretaria'), true);
  for (const rol of ['admin', 'profesor', 'SECRETARIA', undefined, null]) assert.equal(puedeGestionarHorariosExternos(rol), false);
});
test('direct navigation renders content for secretary and redirects other roles', async () => {
  for (const rol of ['secretaria', 'admin', 'profesor', undefined]) {
    const Guard = await cargarComponente('./RequireHorariosExternos.tsx', rol);
    const html = renderToStaticMarkup(React.createElement(Guard));
    if (rol === 'secretaria') { assert.match(html, /data-outlet/); assert.doesNotMatch(html, /data-redirect/); }
    else { assert.match(html, /data-redirect="\/app\/dashboard"/); assert.doesNotMatch(html, /data-outlet/); }
  }
});
test('rendered navigation hides external Excel from administrator without hiding maintenance', async () => {
  const original = globalThis.window;
  try {
    globalThis.window = { matchMedia: () => ({ matches: false }) };
    for (const rol of ['admin', 'secretaria', 'profesor']) {
      const Layout = await cargarComponente('../../components/layout/AppLayout.tsx', rol);
      const html = renderToStaticMarkup(React.createElement(Layout));
      assert.equal(html.includes('href="/app/horarios-externos"'), rol === 'secretaria');
      assert.equal(html.includes('href="/app/administracion-periodos"'), rol === 'admin');
      if (rol === 'admin') assert.ok(html.includes('href="/app/asignaturas"'));
    }
  } finally { globalThis.window = original; }
});
test('configured external route uses its dedicated guard without broadening other pages', async () => {
  const ts = await import('typescript');
  const resolver = createRequire(import.meta.url);
  let fuente = await readFile(new URL('../../app/router.tsx', import.meta.url), 'utf8');
  const arbol = ts.createSourceFile('router.tsx', fuente, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TSX);
  for (const declaracion of arbol.statements.filter(ts.isImportDeclaration)) {
    const nombres = [];
    if (declaracion.importClause?.name) nombres.push(declaracion.importClause.name.text);
    const adicionales = declaracion.importClause?.namedBindings;
    if (adicionales && ts.isNamedImports(adicionales)) nombres.push(...adicionales.elements.map(elemento => elemento.name.text));
    const reemplazo = nombres.map(nombre => nombre === 'createBrowserRouter'
      ? 'const createBrowserRouter = rutas => rutas;'
      : `const ${nombre} = function ${nombre}() { return null; };`).join('\n');
    fuente = fuente.replace(declaracion.getText(arbol), reemplazo);
  }
  fuente = `import React from ${JSON.stringify(pathToFileURL(resolver.resolve('react')).href)};\n${fuente}`;
  const codigo = ts.transpileModule(fuente, { compilerOptions: { jsx: ts.JsxEmit.React, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  const { router } = await import(`data:text/javascript;base64,${Buffer.from(codigo).toString('base64')}`);
  function guardias(rutas, destino, previas = []) {
    for (const ruta of rutas) {
      const actuales = [...previas, ruta.element?.type?.name].filter(Boolean);
      if (ruta.path === destino) return actuales;
      const encontradas = ruta.children && guardias(ruta.children, destino, actuales);
      if (encontradas) return encontradas;
    }
  }
  assert.ok(guardias(router, 'horarios-externos').includes('RequireHorariosExternos'));
  assert.ok(!guardias(router, 'horarios-externos').includes('RequireGestionAsignaturas'));
  assert.ok(guardias(router, 'asignaturas').includes('RequireGestionAsignaturas'));
  assert.ok(guardias(router, 'administracion-periodos').includes('RequireAdministracionPeriodos'));
});
