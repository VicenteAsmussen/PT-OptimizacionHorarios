import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

async function renderizarNavegacion(rol, movil = false, pagina = '/app/dashboard') {
  const ts = await import('typescript');
  const resolver = createRequire(import.meta.url);
  const archivo = new URL('./AppLayout.tsx', import.meta.url);
  let fuente = await readFile(archivo, 'utf8');
  fuente = fuente.replace(/^import .* from ["']([^"']+)["'];$/gm, (linea, ruta) => {
    if (ruta === 'react') return linea.replace(/["']react["']/, JSON.stringify(pathToFileURL(resolver.resolve('react')).href));
    if (ruta === 'react-router-dom') return `const Outlet = () => React.createElement('span', { 'data-outlet': true });
      const NavLink = ({ to, children, className }) => React.createElement('a', {
        href: to, className, 'aria-current': to === ${JSON.stringify(pagina)} ? 'page' : undefined
      }, children); const Link = NavLink;`;
    if (ruta.endsWith('/useAuth')) return `const useAuth = () => ({ usuario: { nombre: 'Prueba', rol: ${JSON.stringify(rol)} }, logout() {} });`;
    if (ruta.endsWith('/mi-horario/modelo')) return 'const puedeConsultarMiHorario = puedeRegistrarDisponibilidad;';
    if (/\.(png|svg)$/.test(ruta)) return `const ${linea.split(' ')[1]} = ${JSON.stringify(ruta)};`;
    return linea.replace(/["']([^"']+)["']/, JSON.stringify(new URL(`${ruta}.ts`, archivo).href));
  });
  fuente = `import React from ${JSON.stringify(pathToFileURL(resolver.resolve('react')).href)};\n${fuente}`;
  const codigo = ts.transpileModule(fuente, {
    compilerOptions: { jsx: ts.JsxEmit.React, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 }
  }).outputText;
  const original = globalThis.window;
  try {
    globalThis.window = { matchMedia: () => ({ matches: movil }) };
    const Layout = (await import(`data:text/javascript;base64,${Buffer.from(codigo).toString('base64')}`)).default;
    const html = renderToStaticMarkup(React.createElement(Layout));
    const navegacion = html.match(/<nav aria-label="Navegación principal">([\s\S]*?)<\/nav>/)?.[1];
    assert.ok(navegacion, 'Debe existir una única navegación principal');
    return { html, navegacion };
  } finally {
    globalThis.window = original;
  }
}

const rutasPorRol = {
  admin: ['dashboard', 'asignaturas', 'profesores', 'administracion-periodos', 'resultados-horarios'],
  secretaria: ['dashboard', 'asignaturas', 'profesores', 'seguimiento-disponibilidad', 'horarios-externos', 'optimizacion', 'resultados-horarios'],
  profesor: ['dashboard', 'disponibilidad', 'mi-horario']
};

for (const [rol, rutas] of Object.entries(rutasPorRol)) {
  for (const movil of [false, true]) {
    test(`la navegación de ${rol} conserva destinos y agrupa solo gestión en ${movil ? 'móvil' : 'escritorio'}`, async () => {
      const { html, navegacion } = await renderizarNavegacion(rol, movil);
      assert.deepEqual([...navegacion.matchAll(/href="([^"]+)"/g)].map(coincidencia => coincidencia[1]), rutas.map(ruta => `/app/${ruta}`));
      assert.equal(navegacion.includes('>Catálogos</h2>'), rol !== 'profesor');
      assert.equal(navegacion.includes('>Planificación</h2>'), rol !== 'profesor');
      assert.equal((navegacion.match(/class="enlace-con-icono"/g) || []).length, rutas.length);
      if (movil) {
        assert.match(html, /<dialog[^>]*id="navegacion-movil"/);
        assert.match(html, /aria-label="Cerrar navegación principal"/);
      } else {
        assert.match(html, /<aside class="sidebar"/);
        assert.doesNotMatch(html, /<dialog/);
      }
    });
  }
}

test('los iconos elegidos acompañan sus etiquetas sin cambiar nombres ni destinos', async () => {
  const { navegacion } = await renderizarNavegacion('secretaria');
  const opciones = [
    ['asignaturas', 'Asignaturas', 'asignaturas.svg'],
    ['profesores', 'Profesores', 'Profesores.svg'],
    ['seguimiento-disponibilidad', 'Seguimiento de disponibilidad', 'Seguimiento-Disponibilidad.svg'],
    ['horarios-externos', 'Horarios departamentos externos', 'Horario-Departamentos-Externos.svg'],
    ['optimizacion', 'Modelo de optimización', 'modelo-optimizacion.svg'],
    ['resultados-horarios', 'Gestión del horario', 'gestion-horario.svg']
  ];
  for (const [ruta, etiqueta, icono] of opciones) {
    const enlace = navegacion.match(new RegExp(`<a href="/app/${ruta}"[^>]*>([\\s\\S]*?)</a>`))?.[1];
    assert.ok(enlace, `Debe conservarse ${ruta}`);
    assert.ok(enlace.includes(`/iconos/${icono}"`), `Debe usarse ${icono}`);
    assert.match(enlace, /alt="" aria-hidden="true" width="20" height="20"/);
    assert.ok(enlace.includes(`<span>${etiqueta}</span>`));
  }
  const { navegacion: administrador } = await renderizarNavegacion('admin');
  const periodos = administrador.match(/<a href="\/app\/administracion-periodos"[^>]*>([\s\S]*?)<\/a>/)?.[1];
  assert.ok(periodos);
  assert.match(periodos, /<img class="sidebar-icono" src="[^"]*\/Gestion-periodos\.svg" alt="" aria-hidden="true" width="20" height="20"\/>/);
  assert.match(periodos, /<span>Administración de períodos<\/span>/);
  const { navegacion: profesor } = await renderizarNavegacion('profesor');
  for (const icono of ['panel-principal.svg', 'Mi-Disponibilidad.svg', 'Mi-horario.svg']) {
    assert.ok(profesor.includes(`/iconos/${icono}"`));
  }
});

test('el acceso por teclado permite saltar al contenido sin eliminar el enlace activo', async () => {
  for (const movil of [false, true]) {
    const { html, navegacion } = await renderizarNavegacion('secretaria', movil, '/app/optimizacion');
    assert.match(html, /<a class="salto-contenido" href="#contenido-principal">Saltar al contenido<\/a>/);
    assert.match(html, /<main id="contenido-principal" class="main-content" tabindex="-1">/);
    assert.match(navegacion, /href="\/app\/optimizacion" class="enlace-con-icono" aria-current="page"/);
  }
});

test('los estilos conservan ancho, foco y hover y refuerzan selección, alineación y área táctil', async () => {
  const css = await readFile(new URL('../../styles/global.css', import.meta.url), 'utf8');
  const variables = await readFile(new URL('../../styles/variables.css', import.meta.url), 'utf8');
  assert.match(css, /grid-template-columns:\s*15rem minmax\(0, 1fr\)/);
  assert.match(css, /:focus-visible\s*\{[^}]*outline:\s*3px solid var\(--color-foco\)/);
  assert.match(css, /\.sidebar nav a:hover\s*\{[^}]*var\(--color-sidebar-hover\)/);
  assert.match(css, /\.sidebar nav a\[aria-current="page"\]::before\s*\{[^}]*background:\s*var\(--color-blanco\)/);
  assert.match(css, /\.sidebar nav a span:last-child\s*\{[^}]*min-width:\s*0;[^}]*overflow-wrap:\s*normal/);
  assert.match(css, /@media \(any-pointer: coarse\)\s*\{\s*\.sidebar nav a\s*\{[^}]*min-height:\s*2\.75rem/);
  assert.match(css, /\.salto-contenido:focus\s*\{[^}]*transform:\s*translateY\(0\)/);
  assert.match(variables, /--fuente-principal:\s*"Roboto"/);
});

test('el botón de usuario conserva los colores originales compartidos con Sonner', async () => {
  const css = await readFile(new URL('../../styles/global.css', import.meta.url), 'utf8');
  const variables = await readFile(new URL('../../styles/variables.css', import.meta.url), 'utf8');
  assert.match(variables, /--color-usuario-fondo:\s*#58A6CF;/);
  assert.match(variables, /--color-usuario-hover:\s*#4596C0;/);
  const boton = css.match(/\.boton-usuario\s*\{([^}]+)\}/)?.[1];
  assert.doesNotMatch(boton, /--color-usuario-(?:fondo|hover):/);
  assert.match(boton, /background:\s*var\(--color-usuario-fondo\)/);
  assert.match(css, /\.boton-usuario:hover\s*\{[^}]*background:\s*var\(--color-usuario-hover\)/);
});

test('los iconos se alinean con la primera línea de las etiquetas sin centrar bloques multilínea', async () => {
  const css = await readFile(new URL('../../styles/global.css', import.meta.url), 'utf8');
  const fila = css.match(/\.sidebar nav a\.enlace-con-icono\s*\{([^}]+)\}/)?.[1];
  const icono = css.match(/\.sidebar-icono\s*\{([^}]+)\}/)?.[1];
  assert.match(fila, /align-items:\s*flex-start/);
  assert.match(icono, /margin-block-start:\s*0\.075rem/);
  assert.match(icono, /width:\s*1\.25rem;[^]*height:\s*1\.25rem/);
});

test('la barra recupera espacio horizontal sin ensancharse ni reducir la tipografía', async () => {
  const css = await readFile(new URL('../../styles/global.css', import.meta.url), 'utf8');
  const barra = css.match(/\.sidebar\s*\{([^}]+)\}/)?.[1];
  const fila = css.match(/\.sidebar nav a\.enlace-con-icono\s*\{([^}]+)\}/)?.[1];
  assert.match(barra, /padding:\s*1\.5rem 1rem/);
  assert.match(fila, /gap:\s*0\.5rem/);
  assert.match(css, /grid-template-columns:\s*15rem minmax\(0, 1fr\)/);
  assert.match(css, /\.sidebar nav a\s*\{[^}]*font-size:\s*var\(--tamano-navegacion\)/);
});

test('el ajuste óptico del modelo conserva la columna común de iconos', async () => {
  const css = await readFile(new URL('../../styles/global.css', import.meta.url), 'utf8');
  const modelo = css.match(/\.sidebar nav a\[href="\/app\/optimizacion"\] \.sidebar-icono\s*\{([^}]+)\}/)?.[1];
  assert.ok(modelo, 'El ajuste debe limitarse al icono del modelo');
  assert.match(modelo, /padding:\s*0\.0625rem/);
  assert.doesNotMatch(modelo, /width:|height:|transform:/);
});
