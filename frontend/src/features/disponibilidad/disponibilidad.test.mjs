import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { registerHooks } from 'node:module';

registerHooks({ resolve(especificador, contexto, siguiente) {
  if (contexto.parentURL?.includes('/frontend/src/') && especificador.startsWith('.') && !/\.[a-z]+$/i.test(especificador)) {
    return siguiente(`${especificador}.ts`, contexto);
  }
  return siguiente(especificador, contexto);
} });

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
    if (nombre === 'react' && !(nombre in dependencias)) return { useRef: inicial => ({ current: inicial }), useEffect: () => {} };
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
    '../../lib/periodos': await import('../../lib/periodos.ts'),
    react: hooks, 'react/jsx-runtime': jsx, 'react-router-dom': { Navigate: 'navigate', Outlet: 'outlet' },
    '../../hooks/useAuth': { useAuth: () => ({ usuario: { id: 4, rol } }) },
    '../../lib/api': { ApiError }, './estado': modelo, './parejas': await import('./parejas.ts'), './disponibilidad.api': { disponibilidadApi: api },
    '../../assets/iconos/Enviar.svg': { default: 'Enviar.svg' },
    '../../assets/iconos/editar_Asignatura.svg': { default: 'editar_Asignatura.svg' },
    '../../assets/iconos/marcar-todo.svg': { default: 'marcar-todo.svg' },
    '../mi-horario/MiHorario.module.css': { default: { estado: 'estado', publicado: 'publicado', propuesta: 'propuesta', preparacion: 'preparacion' } },
    './GrillaDisponibilidad': { default: 'grilla' }, './Disponibilidad.module.css': { default: {
      tarjeta: 'tarjeta', panelGrilla: 'panelGrilla', contexto: 'contexto', pieGrilla: 'pieGrilla',
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
    boton: texto => elementos('button').find(b => React.Children.toArray(b.props.children)
      .filter(hijo => typeof hijo === 'string').join('') === texto),
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

test('sondeo de cálculo bloquea edición y conserva borrador al bloquear, fallar y liberar', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let activa = false, fallar = false, posts = 0;
  const pagina = await montarPagina({
    consultar: async id => {
      if (fallar) throw new Error('Consulta temporalmente no disponible');
      return { planificaciones: planes, bloques, seleccion: id ? { ...seleccion, planificacionSemestreId: id, editable: !activa, ...(activa ? { bloqueadaPorOptimizacion: true } : {}) } : null };
    }, enviar: async () => { posts++; },
  });
  try {
    await pagina.esperar();
    pagina.elementos('grilla')[0].props.alternar(20); pagina.renderizar();
    pagina.elementos('grilla')[0].props.alternar(10); pagina.renderizar();
    assert.equal(pagina.boton('Enviar disponibilidad').props.disabled, false);
    activa = true; t.mock.timers.tick(5000); await pagina.esperar();
    assert.equal(pagina.elementos('grilla')[0].props.bloqueada, true);
    assert.deepEqual(pagina.elementos('grilla')[0].props.bloquesIds, [20, 10]);
    assert.match(pagina.texto(), /Edición bloqueada durante el cálculo/); assert.equal(posts, 0);
    fallar = true; t.mock.timers.tick(5000); await pagina.esperar();
    assert.match(pagina.texto(), /El borrador se conserva/);
    fallar = false; activa = false; t.mock.timers.tick(5000); await pagina.esperar();
    assert.equal(pagina.elementos('grilla')[0].props.bloqueada, false);
    assert.deepEqual(pagina.elementos('grilla')[0].props.bloquesIds, [20, 10]);
    assert.equal(pagina.boton('Enviar disponibilidad').props.disabled, false); assert.equal(posts, 0);
  } finally { pagina.desmontar(); t.mock.timers.reset(); }
});

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

test('la cabecera amplía carga docente y reserva una línea para la ayuda en escritorio', async () => {
  const css = await readFile(new URL('./Disponibilidad.module.css', import.meta.url), 'utf8');
  assert.match(css, /\.panelGrilla\s*\{[^}]*container-type:\s*inline-size/);
  assert.match(css, /\.ayudaMouse\s*\{[^}]*max-width:\s*none/);
  assert.match(css, /@container \(min-width: 68rem\)\s*\{[^]*?grid-template-columns:\s*max-content minmax\(0, 1fr\)/);
  assert.match(css, /@container \(min-width: 68rem\)[^]*?\.ayudaMouse\s*\{[^}]*white-space:\s*nowrap/);
  const cabecera = css.match(/\.cabeceraGrilla\s*\{([^}]+)\}/)[1];
  assert.match(cabecera, /grid-template-columns:\s*minmax\(0, 1fr\)/);
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
    assert.match(html, /<summary[^>]*>[^]*Carga docente[^]*2[^]*bloques requeridos[^]*<\/summary>/);
    assert.match(html, /<li[^>]*>MAT[^]*Matemática[^]*sección 1[^]*Teoría[^]*2 bloques[^]*<\/li>/);
    assert.doesNotMatch(html, /<h2/);
    assert.doesNotMatch(html, /Las horas de carga equivalen a bloques\. Este es el mínimo que debes seleccionar\./);
  } finally { p.desmontar(); }
});

test('el contexto precede a la grilla y la carga acompaña el contador, sin cambiar la selección masiva', async () => {
  const envios = [];
  const p = await montarPagina({
    consultar: async id => ({ planificaciones: [planes[0]], bloques, seleccion: id ? seleccion : null }),
    enviar: async (id, ids) => { envios.push({ id, ids }); return { ...seleccion, bloquesIds: ids }; },
  });
  try {
    await p.esperar();
    const paneles = p.elementos('div').filter(elemento => elemento.props.className === 'contexto');
    assert.equal(paneles.length, 1);
    assert.equal(p.elementos('select', paneles[0]).length, 1);
    assert.equal(p.elementos('details', paneles[0]).length, 0);
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
    assert.equal(p.boton('Deseleccionar todo'), undefined);
    assert.equal(p.boton('Seleccionar todo'), undefined);
    p.boton('Editar disponibilidad').props.onClick(); p.renderizar();
    assert.equal(p.boton('Deseleccionar todo').props.disabled, false);
  } finally { p.desmontar(); }
});

test('las acciones quedan al pie de la grilla, separadas del contexto', async () => {
  const p = await montarPagina({ consultar: async id => ({ planificaciones: [planes[0]], bloques,
    seleccion: id ? { ...seleccion, bloquesIds: [20, 10] } : null }) });
  try {
    await p.esperar();
    const panel = p.elementos('footer')[0];
    const barra = p.elementos('div', panel).find(elemento => elemento.props.role === 'group'
      && elemento.props['aria-label'] === 'Acciones de disponibilidad');
    assert.ok(barra);
    assert.equal(p.elementos('button', panel).length, 1);
    const tarjetaGrilla = p.elementos('div').find(elemento => elemento.props.className?.split(/\s+/).includes('panelGrilla'));
    assert.equal(p.elementos('button', tarjetaGrilla).length, 1);
    assert.ok(p.elementos('button', barra).some(boton => [].concat(boton.props.children).includes('Editar disponibilidad')));
    assert.equal(p.boton('Deseleccionar todo'), undefined);
    assert.doesNotMatch(p.texto(), /Enviar disponibilidad no cambia el estado de la planificación/);
    assert.doesNotMatch(p.texto(), /Cambiar de carrera y período descarta la selección sin enviar/);
    p.boton('Editar disponibilidad').props.onClick(); p.renderizar();
    const nuevaBarra = p.elementos('div').find(elemento => elemento.props.role === 'group');
    assert.ok(p.elementos('button', nuevaBarra).some(boton => [].concat(boton.props.children)
      .includes('Enviar disponibilidad')));
    assert.ok(p.elementos('button', nuevaBarra).some(boton => boton.props.children === 'Cancelar edición'));
    assert.equal(p.elementos('button', p.elementos('footer')[0]).length, 3);
  } finally { p.desmontar(); }
});

test('contexto antes de la grilla en el DOM y contador junto a la carga, sin panel lateral', async () => {
  const p = await montarPagina({ consultar: async id => ({ planificaciones: [planes[0]], bloques,
    seleccion: id ? seleccion : null }) });
  try {
    await p.esperar();
    const encabezado = p.elementos('header')[0];
    const grilla = p.elementos('div').find(elemento => elemento.props.className?.split(/\s+/).includes('panelGrilla'));
    const contexto = p.elementos('div').find(elemento => elemento.props.className === 'contexto');
    assert.equal(p.elementos('h1', encabezado).length, 1);
    assert.equal(p.elementos('p', encabezado).length, 2);
    assert.equal(p.elementos('grilla', grilla).length, 1);
    assert.equal(p.elementos('select', grilla).length, 0);
    assert.equal(p.elementos('select', contexto).length, 1);
    assert.equal(p.elementos('details', grilla).length, 1);
    assert.equal(p.elementos('button', contexto).length, 0);
    assert.equal(p.elementos('aside').length, 0);
    const orden = p.elementos('div');
    assert.ok(orden.findIndex(elemento => elemento.props.className === 'contexto')
      < orden.findIndex(elemento => elemento.props.className === 'panelGrilla'));
    const pie = p.elementos('footer', grilla)[0];
    assert.ok(pie);
    assert.match(p.texto(), /Marca los bloques en que puedes impartir clases/);
  } finally { p.desmontar(); }
});

test('disponibilidad muestra carrera, período y estado como Mi horario y actualiza la etiqueta al cambiar', async () => {
  const { renderToStaticMarkup } = await import('react-dom/server');
  const planificaciones = ['preparacion', 'propuesta', 'publicado'].map((estadoPlanificacion, indice) => ({
    ...planes[0], id: 7 + indice, codigo: `2098-${indice + 1}`, estadoPlanificacion,
  }));
  const p = await montarPagina({ consultar: async id => ({ planificaciones, bloques,
    seleccion: id ? { ...seleccion, planificacionSemestreId: id, editable: id === 7 } : null }) });
  try {
    await p.esperar();
    const etiquetas = ['Preparación', 'Propuesta', 'Publicado'];
    for (const [indice, etiqueta] of etiquetas.entries()) {
      const html = renderToStaticMarkup(p.elementos('select')[0]);
      assert.ok(html.includes(`Informática — 2098-${indice + 1} — ${etiqueta}`));
      p.elementos('select')[0].props.onChange({ target: { value: String(7 + indice) } });
      p.renderizar(); await p.esperar();
      assert.match(p.texto(), new RegExp(`Estado del período:\\s+${etiqueta}`));
      const estadoVisible = p.elementos('span').find(elemento => elemento.props.className?.startsWith('estado '));
      assert.equal(estadoVisible.props.className, `estado ${['preparacion', 'propuesta', 'publicado'][indice]}`);
      if (indice > 0) {
        assert.equal(p.boton('Editar disponibilidad'), undefined);
        assert.equal(p.boton('Enviar disponibilidad'), undefined);
      }
    }
  } finally { p.desmontar(); }
});

test('la instrucción es breve y la recomendación no repite el mínimo', async () => {
  const { renderToStaticMarkup } = await import('react-dom/server');
  const p = await montarPagina({ consultar: async id => ({ planificaciones: [planes[0]], bloques,
    seleccion: id ? seleccion : null }) });
  try {
    await p.esperar();
    const html = renderToStaticMarkup(p.elementos('header')[0]);
    assert.match(html, /Marca los bloques en que puedes impartir clases/);
    assert.match(p.texto(), /Seleccionar más bloques facilita la generación del horario/);
    assert.doesNotMatch(html, /mínimo/);
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

test('la grilla mantiene selección accesible y colores sin cuadros ni dibujos interiores', async () => {
  const css = await readFile(new URL('./Disponibilidad.module.css', import.meta.url), 'utf8');
  assert.match(css, /\.grilla thead th:first-child\s*\{[^}]*white-space:\s*nowrap/);
  for (const clase of ['marcado', 'guardado']) {
    const regla = css.match(new RegExp(`\\.${clase}\\s*\\{([^}]+)\\}`))[1];
    assert.match(regla, /background:\s*var\(--color-azul-hover\)/);
    assert.match(regla, /color:\s*var\(--color-azul-texto\)/);
  }
  const jsx = await import('react/jsx-runtime');
  const modelo = await import('./estado.ts');
  const { renderToStaticMarkup } = await import('react-dom/server');
  const { default: Grilla } = await compilar('./GrillaDisponibilidad.tsx', {
    'react/jsx-runtime': jsx, './estado': modelo, './parejas': await import('./parejas.ts'),
    './Disponibilidad.module.css': { default: { bloque: 'bloque', marcado: 'marcado', guardado: 'guardado' } },
  });
  let alternado;
  const props = { bloques, bloquesIds: [20], bloqueada: false, guardada: false, alternar: id => { alternado = id; } };
  const borrador = renderToStaticMarkup(Grilla(props));
  assert.match(borrador, /<button type="button" aria-pressed="true" aria-label="Lunes, bloque 1, 08:10–08:50, selecciona la pareja 1 y 2" class="bloque marcado"/);
  assert.doesNotMatch(borrador, /Seleccionado|Sin seleccionar|Enviado/);
  assert.doesNotMatch(borrador, /Selecciona los bloques disponibles\. Cada hora de carga equivale a un bloque\./);
  assert.match(borrador, /<table[^>]*aria-label="Disponibilidad semanal"/);
  assert.match(borrador, /<th scope="row">[^]*?08:10–08:50[^]*?<\/th>/);
  assert.doesNotMatch(borrador.match(/<button[^>]*>([^]*?)<\/button>/)[1], /08:10/);
  assert.match(borrador, /aria-pressed="false"/);
  assert.equal(borrador.match(/<button[^>]*aria-pressed="true"[^>]*>([^]*?)<\/button>/)[1], '');
  assert.doesNotMatch(borrador, /✓|<svg|<img|aria-hidden="true"/);
  assert.doesNotMatch(borrador, /disabled/);
  const guardada = renderToStaticMarkup(Grilla({ ...props, bloqueada: true, guardada: true }));
  assert.match(guardada, /disabled=""/);
  assert.match(guardada, /class="bloque guardado"/);
  assert.doesNotMatch(guardada, /Seleccionado|Sin seleccionar|Enviado/);
  assert.match(guardada, /aria-pressed="true"/);
  assert.equal(guardada.match(/<button[^>]*aria-pressed="true"[^>]*>([^]*?)<\/button>/)[1], '');
  assert.match(guardada, /<th scope="row">[^]*?08:10–08:50[^]*?<\/th>/);
  assert.equal(alternado, undefined);
});

test('selección masiva solo en edición, se oculta al cancelar y en solo lectura', async () => {
  const envios = [];
  const p = await montarPagina({ consultar: async id => ({ planificaciones: planes, bloques,
    seleccion: id ? { ...seleccion, planificacionSemestreId: id, bloquesIds: [20, 10], editable: id === 7 } : null }),
    enviar: async (...datos) => { envios.push(datos); return seleccion; } });
  try {
    await p.esperar();
    assert.equal(p.boton('Seleccionar todo'), undefined);
    assert.equal(p.boton('Deseleccionar todo'), undefined);
    assert.ok(p.boton('Editar disponibilidad'));
    p.boton('Editar disponibilidad').props.onClick(); p.renderizar();
    assert.equal(p.boton('Deseleccionar todo').props.disabled, false);
    p.boton('Deseleccionar todo').props.onClick(); p.renderizar();
    assert.equal(p.boton('Seleccionar todo').props.disabled, false);
    assert.deepEqual(p.elementos('grilla')[0].props.bloquesIds, []);
    assert.doesNotMatch(p.texto(), /Selecciona al menos\s+\d+\s+bloques no reservados antes de enviar/);
    const contador = p.elementos('p').find(elemento => elemento.props.id === 'conteo-disponibilidad');
    assert.equal(contador.props.children[1].props.children, 0);
    assert.equal(p.boton('Enviar disponibilidad').props.disabled, true);
    p.boton('Cancelar edición').props.onClick(); p.renderizar();
    assert.equal(p.boton('Seleccionar todo'), undefined);
    assert.equal(p.boton('Deseleccionar todo'), undefined);
    assert.deepEqual(p.elementos('grilla')[0].props.bloquesIds, [20, 10]);
    p.elementos('select')[0].props.onChange({ target: { value: '8' } }); p.renderizar(); await p.esperar();
    assert.equal(p.boton('Seleccionar todo'), undefined);
    assert.equal(p.boton('Deseleccionar todo'), undefined);
    assert.equal(p.boton('Editar disponibilidad'), undefined);
    assert.deepEqual(envios, []);
  } finally { p.desmontar(); }
});

test('los SVG elegidos acompañan navegación y envío sin reemplazar los nombres accesibles', async () => {
  const layout = await readFile(new URL('../../components/layout/AppLayout.tsx', import.meta.url), 'utf8');
  assert.match(layout, /import iconoDisponibilidad from "\.\.\/\.\.\/assets\/iconos\/Mi-Disponibilidad\.svg"/);
  assert.match(layout, /import iconoMiHorario from "\.\.\/\.\.\/assets\/iconos\/Mi-horario\.svg"/);
  assert.match(layout, /import iconoPanelPrincipal from "\.\.\/\.\.\/assets\/iconos\/panel-principal\.svg"/);
  for (const icono of ['iconoDisponibilidad', 'iconoMiHorario', 'iconoPanelPrincipal']) {
    assert.match(layout, new RegExp(`<img[^>]*src=\\{${icono}\\}[^>]*alt=""[^>]*aria-hidden="true"`));
  }
  for (const archivo of ['Enviar.svg', 'Mi-Disponibilidad.svg', 'Mi-horario.svg', 'panel-principal.svg']) {
    const svg = await readFile(new URL(`../../assets/iconos/${archivo}`, import.meta.url), 'utf8');
    assert.match(svg, /<svg[^>]*viewBox="0 0 24 24"/);
    assert.doesNotMatch(svg, /<script|onload=|href=["']https?:/i);
  }
  const p = await montarPagina({ consultar: async id => ({ planificaciones: [planes[0]], bloques,
    seleccion: id ? seleccion : null }) });
  try {
    await p.esperar();
    const enviar = p.boton('Enviar disponibilidad');
    const icono = p.elementos('span', enviar)[0];
    assert.ok(icono);
    assert.equal(icono.props.style.maskImage, 'url("Enviar.svg")');
    assert.equal(icono.props['aria-hidden'], 'true');
    assert.equal(enviar.props.disabled, true);
    const css = await readFile(new URL('./Disponibilidad.module.css', import.meta.url), 'utf8');
    assert.match(css, /\.iconoAccion\s*\{[^}]*background:\s*var\(--boton-borde\)/);
    assert.match(css, /\.botonConIcono:disabled \.iconoAccion\s*\{[^}]*background:\s*var\(--color-gris-borde\)/);
    assert.doesNotMatch(css, /\.botonEnviar img\s*\{[^}]*invert\(1\)/);
    const marcar = p.boton('Seleccionar todo');
    assert.equal(p.elementos('span', marcar)[0].props.style.maskImage, 'url("marcar-todo.svg")');
    marcar.props.onClick(); p.renderizar();
    assert.equal(p.elementos('span', p.boton('Deseleccionar todo'))[0].props.style.maskImage, 'url("marcar-todo.svg")');
  } finally { p.desmontar(); }
  const guardada = await montarPagina({ consultar: async id => ({ planificaciones: [planes[0]], bloques,
    seleccion: id ? { ...seleccion, bloquesIds: [20, 10] } : null }) });
  try {
    await guardada.esperar();
    const editar = guardada.boton('Editar disponibilidad');
    assert.equal(guardada.elementos('span', editar)[0].props.style.maskImage, 'url("editar_Asignatura.svg")');
    editar.props.onClick(); guardada.renderizar();
    assert.ok(guardada.boton('Deseleccionar todo'));
  } finally { guardada.desmontar(); }
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

test('reservas bloquean selección individual y masiva sin afectar otra carrera ni el mínimo', async () => {
  const m = await import('./estado.ts');
  let estado = cargar(m, { ...seleccion, bloquesReservadosIds: [20] });
  assert.deepEqual(m.reducirDisponibilidad(estado, { tipo: 'alternar', id: 20 }), estado);
  estado = m.reducirDisponibilidad(estado, { tipo: 'seleccionar_todos', bloquesIds: [20, 10, 10] });
  assert.deepEqual(estado.bloquesIds, [10]);
  assert.equal(estado.seleccion.minimoBloques, 2);
  assert.equal(m.puedeEnviar(estado), false);
  assert.deepEqual(m.reducirDisponibilidad(estado, { tipo: 'enviar' }), estado);
  const inyectada = { ...estado, bloquesIds: [20, 10] };
  assert.equal(m.puedeEnviar(inyectada), false);
  assert.deepEqual(m.reducirDisponibilidad(inyectada, { tipo: 'enviar' }), inyectada);
  estado = m.reducirDisponibilidad(estado, { tipo: 'consultar', id: 8 });
  estado = m.reducirDisponibilidad(estado, { tipo: 'cargada', id: 8,
    seleccion: { ...seleccion, planificacionSemestreId: 8, bloquesReservadosIds: [] } });
  estado = m.reducirDisponibilidad(estado, { tipo: 'seleccionar_todos', bloquesIds: [20, 10] });
  assert.deepEqual(estado.bloquesIds, [20, 10]);
  assert.equal(m.puedeEnviar(estado), true);
  assert.deepEqual(m.reducirDisponibilidad(estado, { tipo: 'permiso', id: 7, editable: true,
    bloquesReservadosIds: [20] }), estado);
});

test('reservas históricas se retiran automáticamente al editar, sin modificar lo guardado al cargar o cancelar', async () => {
  const m = await import('./estado.ts');
  let estado = cargar(m, { ...seleccion, bloquesIds: [20, 10], bloquesReservadosIds: [20] });
  assert.deepEqual(estado.bloquesIds, [20, 10]);
  estado = m.reducirDisponibilidad(estado, { tipo: 'editar' });
  assert.deepEqual(estado.bloquesIds, [10]);
  assert.equal(m.puedeEnviar(estado), false);
  const masiva = m.reducirDisponibilidad(estado, { tipo: 'seleccionar_todos', bloquesIds: [20, 10, 30] });
  assert.deepEqual(masiva.bloquesIds, [10, 30]);
  estado = masiva;
  assert.deepEqual(estado.bloquesIds, [10, 30]);
  assert.deepEqual(estado.seleccion.bloquesIds, [20, 10]);
  assert.equal(m.puedeEnviar(estado), true);
  const enviando = m.reducirDisponibilidad(estado, { tipo: 'enviar' });
  assert.deepEqual(m.reducirDisponibilidad(enviando, { tipo: 'editar' }), enviando);
  estado = m.reducirDisponibilidad(estado, { tipo: 'cancelar' });
  assert.deepEqual(estado.bloquesIds, [20, 10]);
  const congelada = cargar(m, { ...seleccion, bloquesIds: [20], bloquesReservadosIds: [20], editable: false });
  assert.deepEqual(m.reducirDisponibilidad(congelada, { tipo: 'editar' }), congelada);
});

test('página advierte capacidad imposible, no envía y usa solo los bloques utilizables al seleccionar todo', async () => {
  const envios = [];
  const p = await montarPagina({ consultar: async id => ({ planificaciones: planes, bloques,
    seleccion: id ? { ...seleccion, planificacionSemestreId: id, bloquesReservadosIds: id === 7 ? [20] : [] } : null }),
    enviar: async (...datos) => { envios.push(datos); return seleccion; } });
  try {
    await p.esperar();
    assert.deepEqual(p.elementos('grilla')[0].props.bloquesReservadosIds, [20]);
    assert.match(p.texto(), /La capacidad utilizable es de 0 bloques y no cubre el mínimo de 2\. Contacta a secretaría\./);
    p.boton('Seleccionar todo').props.onClick(); p.renderizar();
    assert.deepEqual(p.elementos('grilla')[0].props.bloquesIds, []);
    assert.equal(p.boton('Seleccionar todo').props.disabled, true);
    assert.equal(p.boton('Enviar disponibilidad').props.disabled, true);
    await p.boton('Enviar disponibilidad').props.onClick();
    assert.deepEqual(envios, []);
    p.elementos('select')[0].props.onChange({ target: { value: '8' } }); p.renderizar(); await p.esperar();
    assert.doesNotMatch(p.texto(), /La capacidad utilizable/);
    p.boton('Seleccionar todo').props.onClick(); p.renderizar();
    assert.deepEqual(p.elementos('grilla')[0].props.bloquesIds, [20, 10]);
    assert.equal(p.boton('Enviar disponibilidad').props.disabled, false);
  } finally { p.desmontar(); }
});

test('página retira reservas al editar sin botón extra, cancelar conserva lo guardado y solo enviar persiste', async () => {
  let guardada = { ...seleccion, bloquesIds: [20, 10], bloquesReservadosIds: [20] };
  const envios = [];
  const catalogo = [...bloques, { ...bloques[1], id: 30, numeroBloque: 3 }, { ...bloques[1], id: 40, numeroBloque: 4 }];
  const p = await montarPagina({ consultar: async id => ({ planificaciones: [planes[0]], bloques: catalogo, seleccion: id ? guardada : null }),
    enviar: async (id, ids) => { envios.push({ id, ids }); guardada = { ...guardada, bloquesIds: ids }; return guardada; } });
  try {
    await p.esperar();
    assert.doesNotMatch(p.texto(), /Retirar reservas|retira las reservas del borrador/);
    assert.deepEqual(p.elementos('grilla')[0].props.bloquesIds, [20, 10]);
    assert.equal(p.elementos('p').find(nodo => nodo.props.id === 'conteo-disponibilidad').props.children[1].props.children, 1);
    assert.equal(p.boton('Retirar reservas del borrador'), undefined);
    p.boton('Editar disponibilidad').props.onClick(); p.renderizar();
    assert.deepEqual(p.elementos('grilla')[0].props.bloquesIds, [10]);
    assert.equal(p.boton('Retirar reservas del borrador'), undefined);
    p.boton('Seleccionar todo').props.onClick(); p.renderizar();
    assert.deepEqual(p.elementos('grilla')[0].props.bloquesIds, [30, 40]);
    assert.equal(p.boton('Enviar disponibilidad').props.disabled, false);
    assert.deepEqual(envios, []);
    p.boton('Cancelar edición').props.onClick(); p.renderizar();
    assert.deepEqual(p.elementos('grilla')[0].props.bloquesIds, [20, 10]);
    assert.deepEqual(guardada.bloquesIds, [20, 10]);
    p.boton('Editar disponibilidad').props.onClick(); p.renderizar();
    assert.deepEqual(p.elementos('grilla')[0].props.bloquesIds, [10]);
    p.elementos('grilla')[0].props.alternar(30); p.renderizar();
    p.elementos('grilla')[0].props.alternar(40); p.renderizar();
    await p.boton('Enviar disponibilidad').props.onClick(); await p.esperar();
    assert.deepEqual(envios, [{ id: 7, ids: [10, 30, 40] }]);
    assert.deepEqual(p.elementos('grilla')[0].props.bloquesIds, [10, 30, 40]);
    assert.doesNotMatch(p.texto(), /Hay disponibilidad anterior en bloques reservados/);
  } finally { p.desmontar(); }
});

test('rechazo por nueva reserva depura solo los bloques reservados del borrador y nunca reenvía automáticamente', async () => {
  let nueva = false;
  const envios = [];
  const p = await montarPagina({ consultar: async id => ({ planificaciones: [planes[0]], bloques,
    seleccion: id ? { ...seleccion, bloquesReservadosIds: nueva ? [20] : [] } : null }),
    enviar: async (id, ids) => { envios.push({ id, ids }); nueva = true; throw new Error('Reserva nueva'); } });
  try {
    await p.esperar();
    p.boton('Seleccionar todo').props.onClick(); p.renderizar();
    await p.boton('Enviar disponibilidad').props.onClick(); await p.esperar();
    assert.deepEqual(envios, [{ id: 7, ids: [20, 10] }]);
    assert.deepEqual(p.elementos('grilla')[0].props.bloquesIds, [10]);
    assert.deepEqual(p.elementos('grilla')[0].props.bloquesReservadosIds, [20]);
    assert.equal(p.boton('Enviar disponibilidad').props.disabled, true);
    assert.match(p.texto(), /No se pudo cargar o enviar/);
  } finally { p.desmontar(); }
});

test('permiso tras rechazo conserva borrador congelado y descarta respuesta obsoleta', async () => {
  const m = await import('./estado.ts');
  let estado = cargar(m, { ...seleccion, bloquesIds: [20, 10], bloquesReservadosIds: [] });
  estado = m.reducirDisponibilidad(estado, { tipo: 'editar' });
  estado = m.reducirDisponibilidad(estado, { tipo: 'enviar' });
  estado = m.reducirDisponibilidad(estado, { tipo: 'fallo', id: 7, mensaje: 'rechazo' });
  assert.deepEqual(m.reducirDisponibilidad(estado, {
    tipo: 'permiso', id: 8, editable: true, bloquesReservadosIds: [20],
  }), estado);
  const congelado = m.reducirDisponibilidad(estado, {
    tipo: 'permiso', id: 7, editable: false, bloquesReservadosIds: [20],
  });
  assert.deepEqual(congelado.bloquesIds, [20, 10]);
  assert.equal(congelado.error, 'rechazo');
  assert.equal(m.puedeEnviar(congelado), false);
  const editable = m.reducirDisponibilidad(estado, {
    tipo: 'permiso', id: 7, editable: true, bloquesReservadosIds: [20],
  });
  assert.deepEqual(editable.bloquesIds, [10]);
  assert.deepEqual(editable.seleccion.bloquesIds, [20, 10]);
  assert.equal(editable.error, 'rechazo');
  assert.equal(editable.modo, 'edicion');
});

test('grilla muestra solo Reservado en una línea conservando horario accesible y bloqueo', async () => {
  const React = await import('react');
  const jsx = await import('react/jsx-runtime');
  const modelo = await import('./estado.ts');
  const { renderToStaticMarkup } = await import('react-dom/server');
  const { default: Grilla } = await compilar('./GrillaDisponibilidad.tsx', {
    'react/jsx-runtime': jsx, './estado': modelo, './parejas': await import('./parejas.ts'),
    './Disponibilidad.module.css': { default: { bloque: 'bloque', reservado: 'reservado', marcado: 'marcado' } },
  });
  const alternados = [];
  const arbol = Grilla({ bloques, bloquesIds: [20], bloquesReservadosIds: [20],
    bloqueada: false, guardada: false, alternar: id => alternados.push(id) });
  const html = renderToStaticMarkup(arbol);
  assert.match(html, /aria-pressed="true" disabled="" aria-label="Lunes, bloque 1, 08:10–08:50, reservado para esta carrera, disponibilidad anterior"/);
  const celdaReservada = html.match(/<button[^>]*class="bloque reservado"[^>]*>([^]*?)<\/button>/)?.[1];
  assert.equal(celdaReservada, '<span>Reservado</span>');
  assert.match(html, /aria-pressed="false" disabled="" aria-label="Lunes, bloque 2[^" ]*[^]*?pareja no disponible/);
  const botones = nodo => !React.isValidElement(nodo) ? [] : [
    ...(nodo.type === 'button' ? [nodo] : []), ...React.Children.toArray(nodo.props.children).flatMap(botones),
  ];
  const [reservado, libre] = botones(arbol);
  reservado.props.onClick();
  assert.deepEqual(alternados, []);
  libre.props.onClick();
  assert.deepEqual(alternados, []);
});

test('capacidad cero mantiene mínimo y reservas históricas visibles sin permitir envío ni selección masiva', async () => {
  const envios = [];
  const p = await montarPagina({ consultar: async id => ({ planificaciones: [planes[0]], bloques,
    seleccion: id ? { ...seleccion, bloquesIds: [20, 10], bloquesReservadosIds: [20, 10] } : null }),
    enviar: async (...datos) => { envios.push(datos); return seleccion; } });
  try {
    await p.esperar();
    assert.match(p.texto(), /La capacidad utilizable es de 0 bloques y no cubre el mínimo de 2\. Contacta a secretaría\./);
    assert.deepEqual(p.elementos('grilla')[0].props.bloquesIds, [20, 10]);
    p.boton('Editar disponibilidad').props.onClick(); p.renderizar();
    assert.equal(p.boton('Seleccionar todo').props.disabled, true);
    assert.equal(p.boton('Enviar disponibilidad').props.disabled, true);
    assert.equal(p.boton('Retirar reservas del borrador'), undefined);
    assert.deepEqual(p.elementos('grilla')[0].props.bloquesIds, []);
    await p.boton('Enviar disponibilidad').props.onClick();
    assert.deepEqual(envios, []);
    p.boton('Cancelar edición').props.onClick(); p.renderizar();
    assert.deepEqual(p.elementos('grilla')[0].props.bloquesIds, [20, 10]);
  } finally { p.desmontar(); }
});
