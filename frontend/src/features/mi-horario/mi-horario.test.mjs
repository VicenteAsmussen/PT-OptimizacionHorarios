import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

// Match the app's bundler resolution without changing its TypeScript configuration.
registerHooks({ resolve(especificador, contexto, siguiente) {
  if (contexto.parentURL?.includes('/frontend/src/') && especificador.startsWith('.') && !/\.[a-z]+$/i.test(especificador)) {
    return siguiente(`${especificador}.ts`, contexto);
  }
  return siguiente(especificador, contexto);
} });

test('only professors can consult the page and only existing visible states are offered', async () => {
  const m = await import('./modelo.ts');
  assert.equal(m.puedeConsultarMiHorario('profesor'), true);
  for (const rol of ['admin', 'secretaria', undefined, null]) assert.equal(m.puedeConsultarMiHorario(rol), false);
  assert.deepEqual(m.planificacionesVisibles([
    { id: 1, estadoPlanificacion: 'preparacion' }, { id: 2, estadoPlanificacion: 'propuesta' },
    { id: 3, estadoPlanificacion: 'publicado' },
    { id: 4, estadoPlanificacion: 'desconocido' },
  ]).map(p => p.id), [1, 2, 3]);
  assert.equal(m.etiquetaEstado({ estadoPlanificacion: 'preparacion' }), 'Preparación');
  assert.equal(m.etiquetaEstado({ estadoPlanificacion: 'propuesta' }), 'Propuesta');
  assert.equal(m.etiquetaEstado({ estadoPlanificacion: 'publicado' }), 'Publicado');
});

const bloques = [
  { id: 3, dia: 'Miércoles', numeroBloque: 2, horaInicio: '09:10', horaTermino: '10:00' },
  { id: 2, dia: 'Lunes', numeroBloque: 2, horaInicio: '09:10', horaTermino: '10:00' },
  { id: 1, dia: 'Lunes', numeroBloque: 1, horaInicio: '08:10', horaTermino: '09:00' },
];
const clase = { id: 1, bloqueId: 1, planificacionSemestreId: 10, oferta: { asignatura: { nombre: 'Álgebra' }, seccion: 2 }, tipoHora: { tipo: 'Cátedra' }, sala: null };

test('weekly calendar orders days and blocks, retains simultaneous classes and omits other plans', async () => {
  const m = await import('./modelo.ts');
  const calendario = m.crearCalendario(bloques, [clase, { ...clase, id: 2 }, { ...clase, id: 3, planificacionSemestreId: 20 }], 10);
  assert.deepEqual(calendario.dias.map(d => d.nombre), ['Lunes', 'Miércoles']);
  assert.deepEqual(calendario.filas.map(f => f.horario), ['08:10–09:00', '09:10–10:00']);
  assert.deepEqual(calendario.filas[0].celdas[0].clases.map(c => c.id), [1, 2]);
  assert.equal(calendario.filas[0].celdas[1].bloque, undefined);
  assert.equal(calendario.filas[1].celdas[0].clases.length, 0);
  assert.equal(calendario.filas[1].celdas[1].bloque.id, 3);
  assert.deepEqual(bloques.map(b => b.id), [3, 2, 1]);
});

test('subject initials include every word while the full description remains available', async () => {
  const { inicialesAsignatura, describirClase } = await import('./modelo.ts');
  assert.equal(inicialesAsignatura('Introducción a la Programación'), 'IALP');
  assert.equal(inicialesAsignatura('Estructuras de Datos'), 'EDD');
  assert.equal(describirClase(clase).asignatura, 'Álgebra');
});

test('class type labels are compact without changing the full class description', async () => {
  const { abreviarTipoClase, describirClase } = await import('./modelo.ts');
  assert.equal(abreviarTipoClase('Teórica'), 'teo');
  assert.equal(abreviarTipoClase('Práctica'), 'prac');
  assert.equal(abreviarTipoClase('Laboratorio'), 'lab');
  assert.equal(describirClase({ ...clase, tipoHora: { tipo: 'Teórica' } }).tipo, 'Teórica');
});

test('class description includes subject, section, class type and assigned or missing room', async () => {
  const { describirClase } = await import('./modelo.ts');
  assert.deepEqual(describirClase(clase), { asignatura: 'Álgebra', seccion: 'Sección 2', tipo: 'Cátedra', sala: 'sin sala' });
  assert.equal(describirClase({ ...clase, sala: { nombre: 'A-101' } }).sala, 'A-101');
});

test('empty schedules retain the calendar structure without fabricating classes', async () => {
  const { crearCalendario } = await import('./modelo.ts');
  const vacio = crearCalendario(bloques, [], 10);
  assert.equal(vacio.filas.every(f => f.celdas.every(c => c.clases.length === 0)), true);
  assert.deepEqual(crearCalendario([], [], 10), { dias: [], filas: [] });
});

test('calendar renders real read-only cells with all class details and no editing controls', async () => {
  const { createServer } = await import('vite');
  const { createElement } = await import('react');
  const { renderToStaticMarkup } = await import('react-dom/server');
  const servidor = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
  try {
    const { default: Calendario } = await servidor.ssrLoadModule('/src/features/mi-horario/CalendarioSemanal.tsx');
    const html = renderToStaticMarkup(createElement(Calendario, {
      bloques, horarios: [clase, { ...clase, id: 2, bloqueId: 3, sala: { nombre: 'A-101' } }], planificacionId: 10,
    }));
    for (const texto of ['Lunes', 'Miércoles', '08:10', '09:00', 'Álgebra', 'Sección 2', 'Cátedra', 'sin sala', 'A-101']) {
      assert.ok(html.includes(texto), `Missing calendar content: ${texto}`);
    }
    assert.match(html, /<table/);
    assert.match(html, /<table[^>]*aria-label="Horario semanal"/);
    assert.doesNotMatch(html, /Clases asignadas por día y horario/);
    assert.match(html, /scope="col"/);
    assert.match(html, /scope="row"/);
    assert.doesNotMatch(html, /<input|<select|contenteditable/i);
    assert.equal([...html.matchAll(/<button\b[^>]*aria-haspopup="dialog"/g)].length, 2);
    assert.match(html, /type="button"/);

    const abreviado = renderToStaticMarkup(createElement(Calendario, {
      bloques, horarios: [{ ...clase, oferta: { ...clase.oferta, asignatura: { nombre: 'Introducción a la Programación' } } }], planificacionId: 10,
    }));
    assert.match(abreviado, /<strong title="Introducción a la Programación">IALP<\/strong>/);
    assert.match(abreviado, /aria-label="Introducción a la Programación, Sección 2, Cátedra"/);
    assert.match(abreviado, /<th scope="col">Horario<\/th>/);
    assert.match(abreviado, /<th scope="row">08:10–09:00<\/th>/);
    assert.match(abreviado, /<th scope="row">09:10–10:00<\/th>/);
    const celdas = [...abreviado.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/g)];
    assert.ok(celdas.length > 0);
    for (const [, contenido] of celdas) {
      assert.doesNotMatch(contenido, /\d{2}:\d{2}/);
      assert.match(contenido, /^<div class="[^"]*contenidoCelda[^\"]*">[\s\S]*<\/div>$/);
    }

    for (const [tipo, abreviatura] of [['Teórica', 'teo'], ['Práctica', 'prac'], ['Laboratorio', 'lab']]) {
      const compacto = renderToStaticMarkup(createElement(Calendario, {
        bloques, horarios: [{ ...clase, tipoHora: { tipo }, sala: { nombre: 'Sala A-101' } }], planificacionId: 10,
      }));
      assert.match(compacto, /<span>sec 2<\/span>/);
      assert.ok(compacto.includes(`<span title="${tipo}">${abreviatura}</span>`));
      assert.match(compacto, /<span>Sala A-101<\/span>/);
      assert.ok(compacto.includes(`aria-label="Álgebra, Sección 2, ${tipo}"`));
    }

    const { default: EncabezadoMiHorario } = await servidor.ssrLoadModule('/src/features/mi-horario/EncabezadoMiHorario.tsx');
    const encabezado = renderToStaticMarkup(createElement(EncabezadoMiHorario, {
      planificaciones: [{ id: 10, codigo: '2025-2', carreraNombre: 'Informática', estadoPlanificacion: 'propuesta', actual: false }],
      planificacionId: 10, seleccionar: () => {},
    }));
    assert.match(encabezado, /^<header\b[\s\S]*<h1[^>]*>Mi horario<\/h1>[\s\S]*<select[\s\S]*<\/select>[\s\S]*<\/header>$/);
    assert.match(encabezado, /Carrera y período/);
    assert.match(encabezado, /Informática — 2025-2 — Propuesta/);
    assert.match(encabezado, /Estado del período: Propuesta/);

    const { default: DetalleClaseDialogo } = await servidor.ssrLoadModule('/src/features/mi-horario/DetalleClaseDialogo.tsx');
    for (const sala of [null, { nombre: 'Sala A-101' }]) {
      const detalle = renderToStaticMarkup(createElement(DetalleClaseDialogo, {
        clase: { ...clase, oferta: { ...clase.oferta, asignatura: { nombre: 'Introducción a la Programación' } }, tipoHora: { tipo: 'Teórica' }, sala },
        bloque: bloques.find(b => b.id === clase.bloqueId), cerrar: () => {},
      }));
      assert.match(detalle, /<dialog\b[^>]*aria-labelledby="titulo-detalle-clase"/);
      for (const texto of ['Introducción a la Programación', 'Sección 2', 'Teórica', 'Lunes', '08:10', '09:00', sala?.nombre ?? 'sin sala']) {
        assert.ok(detalle.includes(texto), `Missing class detail: ${texto}`);
      }
      assert.match(detalle, /<button[^>]*>Cerrar<\/button>/);
      assert.doesNotMatch(detalle, /<input|<select|<form|contenteditable/i);
    }
  } finally { await servidor.close(); }
});

test('calendar rows use the same compact cell height even when empty or containing several classes', async () => {
  const css = await readFile(new URL('./MiHorario.module.css', import.meta.url), 'utf8');
  assert.match(css, /\.contenidoCelda\s*\{[^}]*height:\s*3rem\s*;[^}]*overflow-y:\s*auto\s*;/);
  assert.match(css, /\.calendario tbody tr\s*\{[^}]*height:\s*3\.25rem\s*;/);
});

test('changing planning immediately clears old data and ignores stale responses', async () => {
  const m = await import('./modelo.ts');
  let estado = m.reducirHorario(m.estadoInicial, { tipo: 'seleccionar', id: 10 });
  estado = m.reducirHorario(estado, { tipo: 'cargado', id: 10, horarios: [clase] });
  assert.equal(estado.horarios.length, 1);
  estado = m.reducirHorario(estado, { tipo: 'seleccionar', id: 20 });
  assert.deepEqual(estado.horarios, []);
  assert.equal(estado.modo, 'cargando');
  assert.equal(m.reducirHorario(estado, { tipo: 'cargado', id: 10, horarios: [clase] }), estado);
  assert.equal(m.reducirHorario(estado, { tipo: 'fallo', id: 10, mensaje: 'Anterior' }), estado);
  estado = m.reducirHorario(estado, { tipo: 'fallo', id: 20, mensaje: 'No disponible' });
  assert.deepEqual(estado.horarios, []);
  assert.equal(estado.error, 'No disponible');
});

// Run the page's real effects with controlled hooks and deferred API responses, without a DOM or sockets.
async function crearPaginaControlada(planificaciones) {
  const ts = await import('typescript');
  const resolver = createRequire(import.meta.url);
  const modelo = await import('./modelo.ts');
  const react = JSON.stringify(pathToFileURL(resolver.resolve('react')).href);
  const fuente = (await readFile(new URL('./MiHorarioPage.tsx', import.meta.url), 'utf8'))
    .replace(/^import .*;\r?\n/gm, '')
    .replace(/^export /gm, '')
    .replace('default function MiHorarioPage', 'function MiHorarioPage');
  const codigo = ts.transpileModule(`import React from ${react};
    export function crear(entorno) {
      const { useEffect, useReducer, useState, miHorarioApi, EncabezadoMiHorario, CalendarioSemanal } = entorno;
      const { estadoInicial, planificacionesVisibles, puedeConsultarMiHorario, reducirHorario } = entorno.modelo;
      const estilos = {}; const useAuth = () => ({ usuario: { id: 1, rol: 'profesor' } });
      class ApiError extends Error {};
      ${fuente}
      return ConsultaMiHorario;
    }`, { compilerOptions: { jsx: ts.JsxEmit.React, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  const { crear } = await import(`data:text/javascript;base64,${Buffer.from(codigo).toString('base64')}`);
  const valores = [], efectos = [], pendientes = [], solicitudes = [];
  let indice, sucio = false, arbol;
  const encabezado = propiedades => React.createElement('select', {
    'aria-label': 'Carrera y período', value: propiedades.planificacionId ?? '',
    onChange: evento => propiedades.seleccionar(Number(evento.target.value)),
  }, propiedades.planificaciones.map(p => React.createElement('option', { key: p.id, value: p.id }, modelo.etiquetaEstado(p))));
  const pagina = crear({ modelo, EncabezadoMiHorario: encabezado,
    CalendarioSemanal: ({ horarios }) => React.createElement('table', { 'aria-label': 'Horario semanal' },
      React.createElement('tbody', null, React.createElement('tr', null, React.createElement('td', null, horarios.map(h => h.oferta.asignatura.nombre).join(', '))))),
    useState(inicial) {
      const posicion = indice++;
      if (!(posicion in valores)) valores[posicion] = inicial;
      return [valores[posicion], siguiente => {
        valores[posicion] = typeof siguiente === 'function' ? siguiente(valores[posicion]) : siguiente;
        sucio = true;
      }];
    },
    useReducer(reducir, inicial) {
      const posicion = indice++;
      if (!(posicion in valores)) valores[posicion] = inicial;
      return [valores[posicion], accion => { valores[posicion] = reducir(valores[posicion], accion); sucio = true; }];
    },
    useEffect(efecto, dependencias) {
      const posicion = indice++;
      const anterior = efectos[posicion];
      if (!anterior || dependencias.some((valor, i) => !Object.is(valor, anterior.dependencias[i]))) {
        pendientes.push(() => { anterior?.limpiar?.(); efectos[posicion] = { dependencias, limpiar: efecto() }; });
      }
    },
    miHorarioApi: {
      contexto: async () => ({ planificaciones, bloques }),
      consultar(id, signal) {
        return new Promise((resolver, rechazar) => solicitudes.push({ id, signal, resolver, rechazar }));
      },
    },
  });
  function renderizar() {
    do {
      sucio = false; indice = 0; arbol = pagina();
      pendientes.splice(0).forEach(efecto => efecto());
    } while (sucio);
  }
  async function asentar() {
    await Promise.resolve(); await Promise.resolve(); renderizar();
  }
  function buscar(elemento, tipo) {
    if (!React.isValidElement(elemento)) return;
    if (elemento.type === tipo) return elemento;
    for (const hijo of React.Children.toArray(elemento.props.children)) {
      const encontrado = buscar(hijo, tipo); if (encontrado) return encontrado;
    }
  }
  renderizar(); await asentar();
  return {
    solicitudes, asentar,
    html: () => renderToStaticMarkup(arbol),
    seleccionar(id) { buscar(arbol, encabezado).props.seleccionar(id); renderizar(); },
    cerrar() { efectos.forEach(efecto => efecto.limpiar?.()); },
  };
}

const periodos = [
  { id: 10, estadoPlanificacion: 'propuesta' },
  { id: 20, estadoPlanificacion: 'preparacion' },
  { id: 30, estadoPlanificacion: 'publicado' },
];
const avisoPreparacion = 'Este período está en Preparación. El horario aún no está habilitado para consulta.';

test('preparation is selectable and shows the exact notice without requesting or rendering a calendar', async () => {
  const pagina = await crearPaginaControlada([periodos[1]]);
  try {
    assert.match(pagina.html(), /<option value="20" selected="">Preparación<\/option>/);
    assert.ok(pagina.html().includes(avisoPreparacion));
    assert.doesNotMatch(pagina.html(), /<table|Cargando horario|No tienes clases/);
    assert.equal(pagina.solicitudes.length, 0);
  } finally { pagina.cerrar(); }
});

test('switching proposal to preparation clears the calendar and published still loads its own classes', async () => {
  const pagina = await crearPaginaControlada(periodos);
  try {
    pagina.solicitudes[0].resolver([clase]); await pagina.asentar();
    assert.match(pagina.html(), /<table/);
    pagina.seleccionar(20);
    assert.ok(pagina.html().includes(avisoPreparacion));
    assert.doesNotMatch(pagina.html(), /<table|Álgebra/);
    assert.equal(pagina.solicitudes[0].signal.aborted, true);
    assert.equal(pagina.solicitudes.length, 1);
    pagina.seleccionar(30);
    assert.doesNotMatch(pagina.html(), /<table|Álgebra/);
    assert.deepEqual(pagina.solicitudes.map(s => s.id), [10, 30]);
    pagina.solicitudes[1].resolver([{ ...clase, planificacionSemestreId: 30 }]); await pagina.asentar();
    assert.match(pagina.html(), /<table/);
    assert.doesNotMatch(pagina.html(), /Preparación\. El horario/);
  } finally { pagina.cerrar(); }
});

for (const resultado of ['success', 'failure']) {
  test(`late ${resultado} cannot restore a calendar in preparation or after returning to the same period`, async () => {
    const pagina = await crearPaginaControlada(periodos);
    try {
      const anterior = pagina.solicitudes[0];
      pagina.seleccionar(20);
      assert.ok(pagina.html().includes(avisoPreparacion));
      if (resultado === 'success') anterior.resolver([clase]); else anterior.rechazar(new Error('Late failure'));
      await pagina.asentar();
      assert.ok(pagina.html().includes(avisoPreparacion));
      assert.doesNotMatch(pagina.html(), /<table|Álgebra|role="alert"/);
      pagina.seleccionar(10);
      const repetida = pagina.solicitudes.at(-1);
      pagina.seleccionar(20); pagina.seleccionar(10);
      assert.doesNotMatch(pagina.html(), /<table|Álgebra|role="alert"/);
      pagina.solicitudes.at(-1).resolver([{ ...clase, oferta: { ...clase.oferta, asignatura: { nombre: 'Current schedule' } } }]);
      await pagina.asentar();
      assert.match(pagina.html(), /<table/);
      if (resultado === 'success') repetida.resolver([clase]); else repetida.rechazar(new Error('Late failure'));
      await pagina.asentar();
      assert.match(pagina.html(), /Current schedule/);
      assert.doesNotMatch(pagina.html(), /Álgebra|role="alert"/);
    } finally { pagina.cerrar(); }
  });
}
