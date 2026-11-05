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
      estilos: { botonVer: 'boton-ver-prueba', botonConIcono: 'boton-con-icono' }, puedeEditar: puedeEditarAsignaturas(rol),
      iconoVer: 'ojo.svg', iconoEditar: 'editar_Asignatura.svg', iconoSecciones: 'secciones.svg', a: { nombre: 'Álgebra' },
      planificacion: { id: 1 }, setSeleccion() {},
    });
    assert.equal(html.includes('>Editar</button>'), rol === 'admin');
    assert.equal(html.includes('Ver Álgebra'), rol === 'secretaria');
    assert.equal(html.includes('ojo.svg'), rol === 'secretaria');
    assert.equal(html.includes('boton-ver-prueba'), rol === 'secretaria');
    assert.ok(html.includes('Gestionar secciones'));
  }
});

test('las acciones de asignaturas muestran los SVG elegidos sin perder textos, permisos ni el estado deshabilitado', async () => {
  for (const rol of ['secretaria', 'admin']) {
    for (const planificacion of [null, { id: 1 }]) {
      const html = await renderizarFragmento(/<div className=\{estilos.acciones\}>\s*\{puedeEditar &&[^]*?<\/div>/, {
        estilos: { botonVer: 'boton-ver-prueba', botonConIcono: 'boton-con-icono', botonSecciones: 'boton-secciones' },
        puedeEditar: puedeEditarAsignaturas(rol), iconoVer: 'ojo.svg', iconoEditar: 'editar_Asignatura.svg',
        iconoSecciones: 'secciones.svg', a: { nombre: 'Álgebra' }, planificacion, setSeleccion() {},
      });
      const botones = [...html.matchAll(/<button\b[^]*?<\/button>/g)].map(coincidencia => coincidencia[0]);
      const editar = botones.find(boton => boton.includes('aria-label="Editar Álgebra"'));
      assert.equal(Boolean(editar), rol === 'admin');
      if (editar) {
        assert.match(editar, /mask-image:url\(&quot;editar_Asignatura\.svg&quot;\)/);
        assert.match(editar, /aria-hidden="true"/);
        assert.match(editar, /boton--editar/);
        assert.match(editar, />Editar<\/button>/);
        assert.match(editar, /boton-con-icono/);
      }
      const secciones = botones.find(boton => boton.includes('aria-label="Gestionar secciones de Álgebra"'));
      assert.ok(secciones);
      assert.match(secciones, /mask-image:url\(&quot;secciones\.svg&quot;\)/);
      assert.match(secciones, /aria-hidden="true"/);
      assert.match(secciones, />Gestionar secciones<\/button>/);
      assert.match(secciones, /boton-con-icono/);
      assert.match(secciones, /boton-secciones/);
      assert.equal(secciones.includes('disabled=""'), planificacion === null);
      assert.equal(html.includes('mask-image:url(&quot;ojo.svg&quot;)'), rol === 'secretaria');
    }
  }
  const css = await readFile(new URL('./Asignaturas.module.css', import.meta.url), 'utf8');
  const botonSecciones = css.match(/\.acciones \.botonSecciones\s*\{([^}]+)\}/)?.[1] ?? '';
  assert.match(botonSecciones, /--boton-fondo:\s*#FEF3C7/i);
  assert.match(botonSecciones, /--boton-hover:\s*#FDE68A/i);
  assert.match(botonSecciones, /--boton-texto:\s*#78350F/i);
  assert.match(botonSecciones, /--boton-borde:\s*#B45309/i);
  const profesores = await readFile(new URL('../profesores/Profesores.module.css', import.meta.url), 'utf8');
  for (const clase of ['botonConIcono', 'icono']) {
    const patron = new RegExp(`\\.${clase}\\s*\\{([^}]+)\\}`);
    const regla = css.match(patron)?.[1]?.replace(/\s+/g, ' ').trim();
    assert.ok(regla);
    assert.equal(regla, profesores.match(patron)?.[1]?.replace(/\s+/g, ' ').trim());
  }
});

test('el botón Ver muestra solo el icono y conserva su nombre accesible', async () => {
  const html = await renderizarFragmento(/<div className=\{estilos.acciones\}>\s*\{puedeEditar &&[^]*?<\/div>/, {
    estilos: { botonVer: 'boton-ver-prueba', botonConIcono: 'boton-con-icono' }, puedeEditar: false,
    iconoVer: 'ojo.svg', iconoEditar: 'editar_Asignatura.svg', iconoSecciones: 'secciones.svg',
    a: { nombre: 'Álgebra' }, planificacion: { id: 1 }, setSeleccion() {},
  });
  const botonVer = html.match(/<button\b[^>]*aria-label="Ver Álgebra"[^>]*>([^]*?)<\/button>/);
  assert.ok(botonVer);
  assert.match(botonVer[1], /mask-image:url\(&quot;ojo\.svg&quot;\)/);
  assert.match(botonVer[1], /aria-hidden="true"/);
  assert.equal(botonVer[1].replace(/<[^>]*>/g, '').trim(), '');
  const css = await readFile(new URL('./Asignaturas.module.css', import.meta.url), 'utf8');
  const regla = css.match(/\.botonVer\s*\{([^}]+)\}/)?.[1];
  assert.ok(regla);
  assert.match(regla, /display:\s*inline-flex/);
  assert.match(regla, /align-items:\s*center/);
  assert.match(regla, /gap:\s*0\.5rem/);
});

test('semestre y secciones usan etiquetas del mismo estilo que Profesores sin cambiar sus valores', async () => {
  for (const cantidad of [0, 2]) {
    const html = await renderizarFragmento(/<table className=\{estilos.tabla\}>[^]*?<\/table>/, {
      estilos: { insignia: 'insignia-prueba', sinSecciones: 'sin-secciones-prueba' },
      visibles: [{ codigo: 'MAT101', nombre: 'Álgebra', semestreMalla: 3, departamento: { nombre: 'Matemática' } }],
      planificacion: { id: 1, codigo: '2026-2' }, conteoVigente: { estado: 'listo', cantidades: new Map([['MAT101', cantidad]]) },
      puedeEditar: true, iconoVer: 'ojo.svg', iconoEditar: 'editar_Asignatura.svg', iconoSecciones: 'secciones.svg', setSeleccion() {},
    });
    assert.match(html, /<span class="insignia-prueba">3<\/span>/);
    assert.ok(html.includes(cantidad === 0
      ? '<span class="sin-secciones-prueba">Sin secciones</span>'
      : '<span class="insignia-prueba">2 secciones</span>'));
  }
  const css = await readFile(new URL('./Asignaturas.module.css', import.meta.url), 'utf8');
  const profesores = await readFile(new URL('../profesores/Profesores.module.css', import.meta.url), 'utf8');
  const etiqueta = css.match(/\.insignia, \.sinSecciones\s*\{([^}]+)\}/)?.[1];
  assert.ok(etiqueta);
  assert.equal(etiqueta.replace(/\s+/g, ' ').trim(),
    profesores.match(/\.insignia, \.tipoProfesor\s*\{([^}]+)\}/)?.[1].replace(/\s+/g, ' ').trim());
  const semestre = css.match(/\.tabla td:nth-child\(4\) \.insignia\s*\{([^}]+)\}/)?.[1];
  assert.ok(semestre);
  assert.equal(semestre.replace(/\s+/g, ' ').trim(),
    profesores.match(/\.tipoPlanta\s*\{([^}]+)\}/)?.[1].replace(/\s+/g, ' ').trim());
  const sinSecciones = css.match(/\.sinSecciones\s*\{([^}]+)\}/g)?.at(-1) ?? '';
  assert.match(sinSecciones, /background:\s*var\(--color-alerta-fondo\)/);
  assert.match(sinSecciones, /color:\s*var\(--color-alerta-texto\)/);
  assert.match(sinSecciones, /border-color:\s*var\(--color-eliminar-borde\)/);
});

test('los filtros comparten la distribución responsive de Profesores y Limpiar filtros tiene su propia fila', async () => {
  const css = await readFile(new URL('./Asignaturas.module.css', import.meta.url), 'utf8');
  const profesores = await readFile(new URL('../profesores/Profesores.module.css', import.meta.url), 'utf8');
  const columnas = fuente => fuente.match(/\.filtros\s*\{[^}]*grid-template-columns:\s*([^;]+);/)?.[1];
  assert.equal(columnas(css), columnas(profesores));
  for (const [ancho, esperado] of [[75, 'repeat(2, minmax(0, 1fr))'], [40, 'minmax(0, 1fr)']]) {
    const patron = new RegExp(`@media\\s*\\(max-width:\\s*${ancho}rem\\)\\s*\\{[^]*?\\.filtros\\s*\\{([^}]+)\\}`);
    const regla = css.match(patron)?.[1] ?? '';
    assert.ok(regla.includes(`grid-template-columns: ${esperado};`));
  }
  assert.match(css.match(/\.filtros > \.acciones\s*\{([^}]+)\}/)?.[1] ?? '', /grid-column:\s*1\s*\/\s*-1/);
});

test('el filtro de semestre de malla ofrece Todos y los semestres del 1 al 10', async () => {
  const html = await renderizarFragmento(/<label>Semestre de malla<select[^]*?<\/select><\/label>/, {
    malla: '', setMalla() {},
  });
  const opciones = [...html.matchAll(/<option\b[^>]*value="([^"]*)"[^>]*>([^<]*)<\/option>/g)];
  assert.deepEqual(opciones.map(opcion => [opcion[1], opcion[2]]), [
    ['', 'Todos'], ...Array.from({ length: 10 }, (_, indice) => [String(indice + 1), String(indice + 1)]),
  ]);
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
