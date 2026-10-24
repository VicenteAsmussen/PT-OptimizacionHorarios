import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const seleccion = { planificacionSemestreId: 7, bloquesIds: [], minimoBloques: 2,
  carga: [{ ofertaId: 1, asignaturaCodigo: 'MAT', asignaturaNombre: 'Matemática', seccion: 1,
    tipoHoraId: 1, tipoHoraNombre: 'Teoría', horas: 2 }], editable: true };
const cargar = (modelo, datos = seleccion) => modelo.reducirDisponibilidad(
  modelo.reducirDisponibilidad(modelo.estadoInicial, { tipo: 'consultar', id: 7 }),
  { tipo: 'cargada', id: 7, seleccion: datos });

test('only professors may access availability; only current assigned contexts are offered', async () => {
  const m = await import('./estado.ts');
  for (const rol of ['admin', 'secretaria', 'jefe_carrera', undefined, null]) assert.equal(m.puedeRegistrarDisponibilidad(rol), false);
  assert.equal(m.puedeRegistrarDisponibilidad('profesor'), true);
  assert.deepEqual(m.planificacionesActuales([{ id: 1, actual: false }, { id: 2, actual: true }]).map(p => p.id), [2]);
});

test('unsaved availability starts empty, never prefills minimum; selection is local and reversible', async () => {
  const m = await import('./estado.ts');
  let estado = cargar(m);
  assert.deepEqual(estado.bloquesIds, []);
  assert.equal(estado.modo, 'edicion');
  assert.equal(m.puedeEnviar(estado), false);
  estado = m.reducirDisponibilidad(estado, { tipo: 'alternar', id: 20 });
  assert.deepEqual(estado.bloquesIds, [20]);
  assert.deepEqual(estado.seleccion.bloquesIds, []);
  assert.equal(m.puedeEnviar(estado), false);
  estado = m.reducirDisponibilidad(estado, { tipo: 'alternar', id: 10 });
  assert.equal(m.puedeEnviar(estado), true);
  estado = m.reducirDisponibilidad(estado, { tipo: 'alternar', id: 10 });
  assert.equal(m.puedeEnviar(estado), false);
  assert.equal(m.puedeEnviar(cargar(m, { ...seleccion, minimoBloques: 0 })), false);
});

test('saved blocks lock, edit explicitly unlocks, and cancellation restores saved values', async () => {
  const m = await import('./estado.ts');
  let estado = cargar(m, { ...seleccion, bloquesIds: [20, 10] });
  assert.equal(estado.modo, 'guardada');
  assert.equal(m.puedeEnviar(estado), false);
  assert.deepEqual(m.reducirDisponibilidad(estado, { tipo: 'alternar', id: 30 }), estado);
  estado = m.reducirDisponibilidad(estado, { tipo: 'editar' });
  assert.equal(estado.modo, 'edicion');
  estado = m.reducirDisponibilidad(estado, { tipo: 'alternar', id: 30 });
  estado = m.reducirDisponibilidad(estado, { tipo: 'cancelar' });
  assert.deepEqual(estado.bloquesIds, [20, 10]);
  assert.equal(estado.modo, 'guardada');
});

test('bulk selection changes only the editable draft and respects saved, sending and frozen states', async () => {
  const m = await import('./estado.ts');
  const todos = { tipo: 'seleccionar_todos', bloquesIds: [20, 10, 20] };
  const ninguno = { tipo: 'deseleccionar_todos' };
  let estado = m.reducirDisponibilidad(cargar(m), todos);
  assert.deepEqual(estado.bloquesIds, [20, 10]);
  assert.deepEqual(estado.seleccion.bloquesIds, []);
  assert.equal(estado.modo, 'edicion');
  assert.equal(m.puedeEnviar(estado), true);
  const enviando = m.reducirDisponibilidad(estado, { tipo: 'enviar' });
  const guardada = cargar(m, { ...seleccion, bloquesIds: [20] });
  const congelada = cargar(m, { ...seleccion, editable: false });
  for (const bloqueado of [enviando, guardada, congelada]) {
    assert.deepEqual(m.reducirDisponibilidad(bloqueado, todos), bloqueado);
    assert.deepEqual(m.reducirDisponibilidad(bloqueado, ninguno), bloqueado);
  }
  estado = m.reducirDisponibilidad(estado, ninguno);
  assert.deepEqual(estado.bloquesIds, []);
  assert.equal(m.puedeEnviar(estado), false);
  assert.equal(estado.modo, 'edicion');
});

test('explicit submit locks on success; failure retains draft; saving blocks duplicate submit and context changes', async () => {
  const m = await import('./estado.ts');
  let estado = cargar(m);
  assert.deepEqual(m.reducirDisponibilidad(estado, { tipo: 'enviar' }), estado);
  for (const id of [20, 10]) estado = m.reducirDisponibilidad(estado, { tipo: 'alternar', id });
  estado = m.reducirDisponibilidad(estado, { tipo: 'enviar' });
  assert.equal(estado.modo, 'enviando');
  assert.equal(m.puedeEnviar(estado), false);
  for (const accion of [{ tipo: 'consultar', id: 8 }, { tipo: 'alternar', id: 30 }, { tipo: 'enviar' }, { tipo: 'cancelar' }]) {
    assert.deepEqual(m.reducirDisponibilidad(estado, accion), estado);
  }
  const fallida = m.reducirDisponibilidad(estado, { tipo: 'fallo', id: 7, mensaje: 'No se pudo guardar.' });
  assert.deepEqual(fallida.bloquesIds, [20, 10]);
  assert.equal(fallida.modo, 'edicion');
  assert.equal(fallida.error, 'No se pudo guardar.');
  const guardada = m.reducirDisponibilidad(estado, { tipo: 'guardada', id: 7,
    seleccion: { ...seleccion, bloquesIds: [20, 10] } });
  assert.equal(guardada.modo, 'guardada');
  assert.deepEqual(guardada.bloquesIds, [20, 10]);
});

test('planning switches clear drafts without saving and ignore old responses; frozen contexts cannot edit', async () => {
  const m = await import('./estado.ts');
  const anterior = m.reducirDisponibilidad(cargar(m), { tipo: 'alternar', id: 20 });
  const nueva = m.reducirDisponibilidad(anterior, { tipo: 'consultar', id: 8 });
  assert.deepEqual(nueva.bloquesIds, []);
  assert.equal(nueva.seleccion, null);
  for (const tipo of ['cargada', 'guardada', 'fallo']) {
    assert.deepEqual(m.reducirDisponibilidad(nueva, { tipo, id: 7, seleccion, mensaje: 'Viejo' }), nueva);
  }
  const congelada = cargar(m, { ...seleccion, editable: false, bloquesIds: [20, 10] });
  assert.equal(congelada.modo, 'guardada');
  assert.equal(m.puedeEnviar(congelada), false);
  for (const accion of [{ tipo: 'editar' }, { tipo: 'alternar', id: 30 }, { tipo: 'enviar' }]) {
    assert.deepEqual(m.reducirDisponibilidad(congelada, accion), congelada);
  }
});

test('grid orders explicit weekdays and block numbers, not database IDs or alphabetically', async () => {
  const { ordenarBloques } = await import('./estado.ts');
  const bloques = [{ id: 1, dia: 'Miercoles', numeroBloque: 1 }, { id: 2, dia: 'Lunes', numeroBloque: 10 },
    { id: 99, dia: 'Lunes', numeroBloque: 2 }, { id: 3, dia: 'Martes', numeroBloque: 1 }];
  assert.deepEqual(ordenarBloques(bloques).map(b => b.id), [99, 2, 3, 1]);
  assert.deepEqual(bloques.map(b => b.id), [1, 2, 99, 3]);
});

test('route and sidebar reuse the professor permission, preserving existing routes and navigation', async () => {
  const ruta = await readFile(new URL('../../app/router.tsx', import.meta.url), 'utf8');
  const layout = await readFile(new URL('../../components/layout/AppLayout.tsx', import.meta.url), 'utf8');
  assert.match(ruta, /element: <RequireDisponibilidad \/>, children: \[\s*\{ path: "disponibilidad", element: <DisponibilidadPage \/> \}/);
  assert.match(layout, /puedeRegistrarDisponibilidad\(usuario\?\.rol\) && \([\s]*<NavLink to="\/app\/disponibilidad"[^]*?Mi disponibilidad/);
  for (const path of ['dashboard', 'profesores', 'asignaturas', 'horarios-externos']) {
    assert.ok(ruta.includes(`path: "${path}"`));
    assert.ok(layout.includes(`to="/app/${path}"`));
  }
});

// Compile JSX in memory: no browser dependency, filesystem output, or production-only test hooks.
async function compilar(archivo, dependencias) {
  const ts = await import('typescript');
  const fuente = await readFile(new URL(archivo, import.meta.url), 'utf8');
  const codigo = ts.transpileModule(fuente, { compilerOptions: {
    jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
  } }).outputText;
  const modulo = { exports: {} };
  new Function('require', 'exports', 'module', codigo)(nombre => {
    assert.ok(nombre in dependencias, `Unexpected dependency: ${nombre}`);
    return dependencias[nombre];
  }, modulo.exports, modulo);
  return modulo.exports;
}

async function montarPagina(api, rol = 'profesor') {
  const React = await import('react');
  const jsx = await import('react/jsx-runtime');
  const modelo = await import('./estado.ts');
  const slots = []; let indice = 0; let efectos = []; let sucio = true; let arbol;
  const hooks = {
    useState(inicial) {
      const posicion = indice++;
      if (!(posicion in slots)) slots[posicion] = typeof inicial === 'function' ? inicial() : inicial;
      return [slots[posicion], valor => {
        const nuevo = typeof valor === 'function' ? valor(slots[posicion]) : valor;
        if (!Object.is(nuevo, slots[posicion])) { slots[posicion] = nuevo; sucio = true; }
      }];
    },
    useRef(inicial) { return hooks.useState(() => ({ current: inicial }))[0]; },
    useReducer(reducir, inicial) {
      const [estado, actualizar] = hooks.useState(inicial);
      return [estado, accion => actualizar(anterior => reducir(anterior, accion))];
    },
    useEffect(efecto, dependencias) {
      const posicion = indice++;
      const previo = slots[posicion];
      if (!previo || dependencias.some((valor, i) => !Object.is(valor, previo.dependencias[i]))) {
        efectos.push(() => {
          previo?.limpiar?.();
          slots[posicion] = { dependencias, limpiar: efecto() };
        });
      }
    },
  };
  class ApiError extends Error { constructor(mensaje, status) { super(mensaje); this.status = status; } }
  const modulo = await compilar('./DisponibilidadPage.tsx', {
    react: hooks, 'react/jsx-runtime': jsx, 'react-router-dom': { Navigate: 'navigate', Outlet: 'outlet' },
    '../../hooks/useAuth': { useAuth: () => ({ usuario: { id: 4, rol } }) },
    '../../lib/api': { ApiError }, './estado': modelo, './disponibilidad.api': { disponibilidadApi: api },
    './GrillaDisponibilidad': { default: 'grilla' }, './Disponibilidad.module.css': { default: {
      tarjeta: 'tarjeta', panelGrilla: 'panelGrilla', panelLateral: 'panelLateral',
    } },
  });
  function renderizar() {
    let vueltas = 0;
    do {
      assert.ok(++vueltas < 30, 'render settled');
      sucio = false; indice = 0; efectos = [];
      arbol = modulo.default();
      efectos.forEach(efecto => efecto());
    } while (sucio);
    return arbol;
  }
  const elementos = (tipo, nodo = arbol) => {
    if (!React.isValidElement(nodo)) return [];
    return [...(nodo.type === tipo ? [nodo] : []),
      ...React.Children.toArray(nodo.props.children).flatMap(hijo => elementos(tipo, hijo))];
  };
  renderizar();
  return {
    elementos, renderizar, ApiError,
    guardia: () => modulo.RequireDisponibilidad(),
    async esperar() { for (let i = 0; i < 5; i++) { await new Promise(resolve => setImmediate(resolve)); renderizar(); } },
    texto: () => { const leer = nodo => React.isValidElement(nodo)
      ? React.Children.toArray(nodo.props.children).map(leer).join(' ') : String(nodo ?? ''); return leer(arbol); },
    boton: texto => elementos('button').find(b => b.props.children === texto),
    desmontar: () => slots.forEach(slot => slot?.limpiar?.()),
  };
}

const planes = [
  { id: 7, actual: true, codigo: '2026-2', carreraNombre: 'Informática', estadoPlanificacion: 'preparacion' },
  { id: 8, actual: true, codigo: '2026-2', carreraNombre: 'Matemática', estadoPlanificacion: 'preparacion' },
  { id: 9, actual: false, codigo: '2025-1', carreraNombre: 'Informática', estadoPlanificacion: 'preparacion' },
];
const bloques = [{ id: 20, dia: 'Lunes', numeroBloque: 1, horaInicio: '08:10:00', horaTermino: '08:50:00' },
  { id: 10, dia: 'Lunes', numeroBloque: 2, horaInicio: '08:50:00', horaTermino: '09:30:00' }];

test('page selects the first current career without a placeholder, never autosaves, and preserves failed drafts', async () => {
  const consultas = []; const envios = []; let fallar = false; let resolverEnvio;
  const api = {
    consultar: async id => { consultas.push(id); return { planificaciones: planes, bloques,
      seleccion: id ? { ...seleccion, planificacionSemestreId: id } : null }; },
    enviar: (id, ids) => { envios.push({ id, ids }); return new Promise((resolve, reject) => {
      resolverEnvio = () => fallar ? reject(new Error('Network failure'))
        : resolve({ ...seleccion, planificacionSemestreId: id, bloquesIds: ids });
    }); },
  };
  const p = await montarPagina(api);
  try {
    await p.esperar();
    assert.deepEqual(consultas, [undefined, 7]);
    assert.equal(p.guardia().type, 'outlet');
    assert.equal(p.elementos('select')[0].props.value, 7);
    assert.deepEqual(p.elementos('option').map(o => o.props.value), [7, 8]);
    assert.equal(p.elementos('option').some(o => o.props.value === 9), false);
    assert.deepEqual(p.elementos('grilla')[0].props.bloquesIds, []);
    assert.equal(p.boton('Enviar disponibilidad').props.disabled, true);
    for (const id of [20, 10]) { p.elementos('grilla')[0].props.alternar(id); p.renderizar(); }
    assert.deepEqual(envios, []);
    assert.equal(p.boton('Enviar disponibilidad').props.disabled, false);
    const primerEnvio = p.boton('Enviar disponibilidad').props.onClick();
    p.renderizar();
    assert.equal(p.elementos('select')[0].props.disabled, true);
    assert.equal(p.boton('Enviando…').props.disabled, true);
    assert.equal(p.elementos('grilla')[0].props.bloqueada, true);
    resolverEnvio(); await primerEnvio; await p.esperar();
    assert.deepEqual(envios, [{ id: 7, ids: [20, 10] }]);
    assert.equal(p.elementos('grilla')[0].props.guardada, true);
    assert.equal(p.elementos('grilla')[0].props.bloqueada, true);
    p.boton('Editar disponibilidad').props.onClick(); p.renderizar();
    assert.equal(p.elementos('grilla')[0].props.guardada, false);
    p.elementos('grilla')[0].props.alternar(10); p.renderizar();
    p.boton('Cancelar edición').props.onClick(); p.renderizar();
    assert.deepEqual(p.elementos('grilla')[0].props.bloquesIds, [20, 10]);
    p.boton('Editar disponibilidad').props.onClick(); p.renderizar();
    fallar = true;
    const segundoEnvio = p.boton('Enviar disponibilidad').props.onClick();
    p.renderizar(); resolverEnvio(); await segundoEnvio; await p.esperar();
    assert.deepEqual(p.elementos('grilla')[0].props.bloquesIds, [20, 10]);
    assert.equal(p.elementos('grilla')[0].props.bloqueada, false);
    assert.equal(p.elementos('grilla')[0].props.guardada, false);
    assert.match(p.texto(), /No se pudo cargar o enviar/);
    assert.equal(p.boton('Enviar disponibilidad').props.disabled, false);
  } finally { p.desmontar(); }
});

test('workload is a collapsed native disclosure with a visible total and expandable assignment details', async () => {
  const { renderToStaticMarkup } = await import('react-dom/server');
  const p = await montarPagina({ consultar: async id => ({ planificaciones: [planes[0]], bloques,
    seleccion: id ? seleccion : null }) });
  try {
    await p.esperar();
    const tarjetas = p.elementos('details');
    assert.equal(tarjetas.length, 1);
    const tarjeta = tarjetas[0];
    assert.match(tarjeta.key, /(?:^|\$)7$/);
    const html = renderToStaticMarkup(tarjeta);
    assert.match(html, /^<details(?:\s[^>]*)?>/);
    assert.doesNotMatch(html, /<details[^>]*\sopen(?:[\s=>])/);
    assert.match(html, /<summary[^>]*>[^]*Carga docente[^]*2[^]*bloques a seleccionar[^]*<\/summary>/);
    assert.match(html, /<li[^>]*>MAT[^]*Matemática[^]*sección 1[^]*Teoría[^]*2 bloques[^]*<\/li>/);
    assert.doesNotMatch(html, /<h2/);
    assert.doesNotMatch(html, /Las horas de carga equivalen a bloques\. Este es el mínimo que debes seleccionar\./);
  } finally { p.desmontar(); }
});

test('planning and workload share a side panel; bulk toggle never submits and locks after saving', async () => {
  const envios = [];
  const p = await montarPagina({
    consultar: async id => ({ planificaciones: [planes[0]], bloques, seleccion: id ? seleccion : null }),
    enviar: async (id, ids) => { envios.push({ id, ids }); return { ...seleccion, bloquesIds: ids }; },
  });
  try {
    await p.esperar();
    const paneles = p.elementos('aside');
    assert.equal(paneles.length, 1);
    assert.equal(p.elementos('select', paneles[0]).length, 1);
    assert.equal(p.elementos('details', paneles[0]).length, 1);
    assert.equal(p.elementos('grilla', paneles[0]).length, 0);
    assert.equal(p.boton('Seleccionar todo').props.disabled, false);
    p.boton('Seleccionar todo').props.onClick(); p.renderizar();
    assert.deepEqual(p.elementos('grilla')[0].props.bloquesIds, [20, 10]);
    assert.deepEqual(envios, []);
    p.boton('Deseleccionar todo').props.onClick(); p.renderizar();
    assert.deepEqual(p.elementos('grilla')[0].props.bloquesIds, []);
    assert.equal(p.boton('Enviar disponibilidad').props.disabled, true);
    assert.deepEqual(envios, []);
    p.boton('Seleccionar todo').props.onClick(); p.renderizar();
    await p.boton('Enviar disponibilidad').props.onClick(); await p.esperar();
    assert.deepEqual(envios, [{ id: 7, ids: [20, 10] }]);
    assert.equal(p.boton('Deseleccionar todo').props.disabled, true);
    p.boton('Editar disponibilidad').props.onClick(); p.renderizar();
    assert.equal(p.boton('Deseleccionar todo').props.disabled, false);
  } finally { p.desmontar(); }
});

test('editing and bulk controls are the last section of the planning card, not above the grid', async () => {
  const p = await montarPagina({ consultar: async id => ({ planificaciones: [planes[0]], bloques,
    seleccion: id ? { ...seleccion, bloquesIds: [20, 10] } : null }) });
  try {
    await p.esperar();
    const panel = p.elementos('aside')[0];
    const barra = p.elementos('div', panel).find(elemento => elemento.props.role === 'group'
      && elemento.props['aria-label'] === 'Acciones de disponibilidad');
    assert.ok(barra);
    assert.equal(p.elementos('button', panel).length, 2);
    assert.equal(p.elementos('div', panel).at(-1).props.role, 'group');
    const tarjetaGrilla = p.elementos('div').find(elemento => elemento.props.className?.split(/\s+/).includes('panelGrilla'));
    assert.equal(p.elementos('button', tarjetaGrilla).length, 0);
    assert.ok(p.elementos('button', barra).some(boton => boton.props.children === 'Editar disponibilidad'));
    assert.ok(p.elementos('button', barra).some(boton => boton.props.children === 'Deseleccionar todo'));
    assert.doesNotMatch(p.texto(), /Enviar disponibilidad no cambia el estado de la planificación/);
    assert.doesNotMatch(p.texto(), /Cambiar de carrera y período descarta la selección sin enviar/);
    p.boton('Editar disponibilidad').props.onClick(); p.renderizar();
    const nuevaBarra = p.elementos('div').find(elemento => elemento.props.role === 'group');
    assert.ok(p.elementos('button', nuevaBarra).some(boton => boton.props.children === 'Enviar disponibilidad'));
    assert.ok(p.elementos('button', nuevaBarra).some(boton => boton.props.children === 'Cancelar edición'));
    assert.equal(p.elementos('button', p.elementos('aside')[0]).length, 3);
  } finally { p.desmontar(); }
});

test('header, grid and planning context are three separate cards', async () => {
  const p = await montarPagina({ consultar: async id => ({ planificaciones: [planes[0]], bloques,
    seleccion: id ? seleccion : null }) });
  try {
    await p.esperar();
    const tarjetas = ['header', 'div', 'aside'].flatMap(tipo => p.elementos(tipo))
      .filter(elemento => elemento.props.className?.split(/\s+/).includes('tarjeta'));
    assert.equal(tarjetas.length, 3);
    const encabezado = tarjetas.find(tarjeta => tarjeta.type === 'header');
    const grilla = tarjetas.find(tarjeta => tarjeta.type === 'div');
    const contexto = tarjetas.find(tarjeta => tarjeta.type === 'aside');
    assert.equal(p.elementos('h1', encabezado).length, 1);
    assert.equal(p.elementos('p', encabezado).length, 1);
    assert.equal(p.elementos('grilla', grilla).length, 1);
    assert.equal(p.elementos('select', grilla).length, 0);
    assert.equal(p.elementos('select', contexto).length, 1);
    assert.equal(p.elementos('details', contexto).length, 1);
    assert.equal(p.elementos('button', contexto).length, 2);
  } finally { p.desmontar(); }
});

test('page description uses a comma and recommends more blocks without an intensifier', async () => {
  const { renderToStaticMarkup } = await import('react-dom/server');
  const p = await montarPagina({ consultar: async id => ({ planificaciones: [planes[0]], bloques,
    seleccion: id ? seleccion : null }) });
  try {
    await p.esperar();
    const html = renderToStaticMarkup(p.elementos('header')[0]);
    assert.match(html, /Debes seleccionar al menos el mínimo de bloques requerido, se recomienda seleccionar más para facilitar la generación del horario/);
    assert.doesNotMatch(html, /;|muchos/);
  } finally { p.desmontar(); }
});

test('one current context auto-selects; stale GET cannot overwrite another context; frozen planning is read-only', async () => {
  const rechazado = await montarPagina({ consultar: async () => ({ planificaciones: [], bloques, seleccion: null }) }, 'admin');
  assert.equal(rechazado.guardia().type, 'navigate');
  assert.equal(rechazado.guardia().props.to, '/app/dashboard');
  rechazado.desmontar();
  const una = await montarPagina({ consultar: async id => ({ planificaciones: [planes[0], planes[2]], bloques,
    seleccion: id ? seleccion : null }) });
  await una.esperar();
  assert.equal(una.elementos('select')[0].props.value, 7);
  assert.deepEqual(una.elementos('grilla')[0].props.bloquesIds, []);
  una.desmontar();
  let respuestaVieja;
  const p = await montarPagina({ consultar: id => id === 7 ? new Promise(resolve => { respuestaVieja = resolve; })
    : Promise.resolve({ planificaciones: planes, bloques,
      seleccion: id ? { ...seleccion, planificacionSemestreId: id, editable: false, bloquesIds: [10] } : null }) });
  try {
    await p.esperar();
    p.elementos('select')[0].props.onChange({ target: { value: '7' } }); p.renderizar();
    p.elementos('select')[0].props.onChange({ target: { value: '8' } }); p.renderizar(); await p.esperar();
    respuestaVieja({ planificaciones: planes, bloques, seleccion: { ...seleccion, bloquesIds: [20] } });
    await p.esperar();
    assert.equal(p.elementos('select')[0].props.value, 8);
    assert.deepEqual(p.elementos('grilla')[0].props.bloquesIds, [10]);
    assert.equal(p.elementos('grilla')[0].props.bloqueada, true);
    assert.equal(p.boton('Editar disponibilidad'), undefined);
    assert.equal(p.boton('Enviar disponibilidad'), undefined);
    assert.match(p.texto(), /Solo lectura/);
  } finally { p.desmontar(); }
});

test('grid shows only block times while preserving accessible selection and light/dark colors', async () => {
  const jsx = await import('react/jsx-runtime');
  const modelo = await import('./estado.ts');
  const { renderToStaticMarkup } = await import('react-dom/server');
  const { default: Grilla } = await compilar('./GrillaDisponibilidad.tsx', {
    'react/jsx-runtime': jsx, './estado': modelo,
    './Disponibilidad.module.css': { default: { bloque: 'bloque', marcado: 'marcado', guardado: 'guardado' } },
  });
  let alternado;
  const props = { bloques, bloquesIds: [20], bloqueada: false, guardada: false, alternar: id => { alternado = id; } };
  const borrador = renderToStaticMarkup(Grilla(props));
  assert.match(borrador, /<button type="button" aria-pressed="true" aria-label="Lunes, bloque 1, 08:10–08:50" class="bloque marcado"/);
  assert.doesNotMatch(borrador, /Seleccionado|Sin seleccionar|Enviado/);
  assert.doesNotMatch(borrador, /Selecciona los bloques disponibles\. Cada hora de carga equivale a un bloque\./);
  assert.match(borrador, /<table[^>]*aria-label="Disponibilidad semanal"/);
  assert.match(borrador, /<span>08:10–08:50<\/span><\/button>/);
  assert.match(borrador, /aria-pressed="false"/);
  assert.doesNotMatch(borrador, /disabled/);
  const guardada = renderToStaticMarkup(Grilla({ ...props, bloqueada: true, guardada: true }));
  assert.match(guardada, /disabled=""/);
  assert.match(guardada, /class="bloque guardado"/);
  assert.doesNotMatch(guardada, /Seleccionado|Sin seleccionar|Enviado/);
  assert.match(guardada, /aria-pressed="true"/);
  assert.match(guardada, /<span>08:10–08:50<\/span><\/button>/);
  assert.equal(alternado, undefined);
});

test('a rejected save rechecks planning editability without losing the unsaved selection', async () => {
  let congelada = false;
  let p;
  p = await montarPagina({
    consultar: async id => ({ planificaciones: [{ ...planes[0], estadoPlanificacion: congelada ? 'propuesta' : 'preparacion' }],
      bloques, seleccion: id ? { ...seleccion, editable: !congelada } : null }),
    enviar: async () => { congelada = true; throw new p.ApiError('La planificación ya no admite cambios.', 409); },
  });
  try {
    await p.esperar();
    for (const id of [20, 10]) { p.elementos('grilla')[0].props.alternar(id); p.renderizar(); }
    await p.boton('Enviar disponibilidad').props.onClick();
    await p.esperar();
    assert.deepEqual(p.elementos('grilla')[0].props.bloquesIds, [20, 10]);
    assert.equal(p.elementos('grilla')[0].props.bloqueada, true);
    assert.equal(p.elementos('grilla')[0].props.guardada, false);
    assert.equal(p.boton('Enviar disponibilidad'), undefined);
    assert.equal(p.boton('Editar disponibilidad'), undefined);
    assert.match(p.texto(), /Solo lectura/);
  } finally { p.desmontar(); }
});

test('API uses only self-service endpoints and the frozen request contract, preserving shared credentials', async () => {
  const { api, ApiError } = await import('../../lib/api.ts');
  const { disponibilidadApi } = await compilar('./disponibilidad.api.ts', { '../../lib/api': { api } });
  const anterior = globalThis.fetch;
  const llamadas = [];
  try {
    globalThis.fetch = async (url, opciones) => {
      llamadas.push({ url, opciones });
      return Response.json({ status: 'success', data: opciones.method === 'POST' ? seleccion : { planificaciones: planes, bloques, seleccion: null } });
    };
    await disponibilidadApi.consultar();
    await disponibilidadApi.consultar(7);
    assert.deepEqual(await disponibilidadApi.enviar(7, [20, 10]), seleccion);
    assert.deepEqual(llamadas.map(c => c.url), [
      'http://localhost:3000/api/disponibilidad-profesores/mi-disponibilidad',
      'http://localhost:3000/api/disponibilidad-profesores/mi-disponibilidad?planificacionSemestreId=7',
      'http://localhost:3000/api/disponibilidad-profesores/mi-disponibilidad',
    ]);
    assert.deepEqual(JSON.parse(llamadas[2].opciones.body), { planificacionSemestreId: 7, bloquesIds: [20, 10] });
    assert.ok(llamadas.every(c => c.opciones.credentials === 'include'));
    globalThis.fetch = async () => Response.json({ message: 'No tienes un perfil de profesor asociado.' }, { status: 403 });
    await assert.rejects(disponibilidadApi.consultar(), error => error instanceof ApiError && error.status === 403
      && error.message === 'No tienes un perfil de profesor asociado.');
  } finally { globalThis.fetch = anterior; }
});
