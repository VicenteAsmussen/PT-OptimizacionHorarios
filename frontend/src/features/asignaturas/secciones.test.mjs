import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const fuente = ruta => readFile(new URL(ruta, import.meta.url), 'utf8');

test('semester selector cannot clear the current selection', async () => {
  const ts = await import('typescript');
  const React = await import('react');
  const { renderToStaticMarkup } = await import('react-dom/server');
  const pagina = await fuente('./AsignaturasPage.tsx');
  const selector = pagina.match(/<label>Semestre para secciones<select[^]*?<\/select><\/label>/)?.[0];
  assert.ok(selector);
  const codigo = ts.transpileModule(`return (${selector});`, {
    compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const renderizar = new Function('React', 'cargando', 'planificacionSemestreId', 'datos', 'setSeleccion', 'setPlanificacionSemestreId', codigo);
  const datos = { planificaciones: [{ id: 7, actual: true, codigo: '2026-2', carrera: { nombre: 'Informatica' } }] };
  const seleccionado = renderizar(React, false, 7, datos, () => {}, () => {});
  const html = renderToStaticMarkup(seleccionado);
  assert.doesNotMatch(html, /<option value=""/);
  assert.match(html, /<option value="7" selected=""/);
  const pendiente = renderizar(React, false, null, datos, () => {}, () => {});
  const select = React.Children.toArray(pendiente.props.children).find(elemento => elemento.type === 'select');
  const opciones = React.Children.toArray(select.props.children);
  const vacia = opciones.find(opcion => opcion.props.value === '');
  assert.ok(vacia?.props.disabled);
  assert.ok(vacia?.props.hidden);
});

// Ejecuta los handlers reales con dobles controlados, igual que el callback de conteos.
async function handlers(contexto) {
  const ts = await import('typescript');
  const panel = await fuente('./PanelSecciones.tsx');
  const funciones = ['abrir', 'completar', 'enviar'].map(nombre => {
    const texto = panel.match(new RegExp(`  function ${nombre}\\([^]*?\\n  }`))?.[0];
    assert.ok(texto, nombre);
    return ts.transpileModule(texto, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  }).join('\n');
  return new Function(...Object.keys(contexto), `${funciones}; return { abrir, completar, enviar };`)(...Object.values(contexto));
}

test('handlers impiden crear, editar y eliminar bloqueados; cierre ignora resultados tardíos', async () => {
  const { estadoSecciones } = await import('./datos.ts');
  for (const tipo of ['crear', 'editar', 'eliminar']) {
    for (const actual of [true, false]) for (const estadoPlanificacion of ['preparacion', 'propuesta', 'publicado', undefined, 'otro']) {
      const llamadas = [];
      let terminar;
      let guardar;
      const vigente = { current: true };
      const accion = { tipo, oferta: { id: 9, seccion: 1, cupos: 0, asignaciones: [{ tipoHoraId: 1, profesorId: 1 }] } };
      const contexto = {
        vigente, puedeEditar: estadoSecciones({ actual, estadoPlanificacion }).puedeEditar, ocupado: false,
        accion, datos: { profesores: [] }, libres: [1], seccion: '1', cupos: '0', asignaciones: [{ tipoHoraId: 1, profesorId: 1 }],
        asignatura: { codigo: 'A' }, semestre: { id: 2 }, contenido: { current: null },
        setAccion: valor => llamadas.push(['accion', valor]), setSeccion() {}, setCupos() {}, setAsignaciones() {},
        setGuardado: () => llamadas.push(['guardado']), cargar: () => llamadas.push(['cargar']),
        alCambiarOfertas: () => llamadas.push(['conteos']),
        prepararOferta: () => ({ seccion: 1, cupos: 0, asignaciones: [{ tipoHoraId: 1, profesorId: 1 }] }),
        asignaturasApi: Object.fromEntries(['crearOferta', 'editarOferta', 'eliminarOferta'].map(nombre => [nombre, async (...args) => llamadas.push([nombre, ...args])])),
        ejecutar: (operacion, completar) => { guardar = operacion; terminar = completar; },
      };
      const reales = await handlers(contexto);
      reales.abrir(accion);
      reales.enviar({ preventDefault() {} });
      if (!contexto.puedeEditar) {
        assert.deepEqual(llamadas, []);
        assert.equal(guardar, undefined);
      } else {
        await guardar();
        assert.equal(llamadas[1][0], tipo === 'crear' ? 'crearOferta' : tipo === 'editar' ? 'editarOferta' : 'eliminarOferta');
        vigente.current = false;
        const antes = llamadas.length;
        terminar();
        reales.abrir(accion);
        reales.enviar({ preventDefault() {} });
        assert.equal(llamadas.length, antes, 'sin recarga ni cierre después de desmontar');
        vigente.current = true;
        terminar();
        assert.deepEqual(llamadas.slice(-4).map(x => x[0]), ['conteos', 'guardado', 'accion', 'cargar']);
      }
    }
  }
});

test('render React muestra estados y motivo accesible; cambios de contexto renuevan clave', async () => {
  const ts = await import('typescript');
  const React = await import('react');
  const { renderToStaticMarkup } = await import('react-dom/server');
  const { createRequire } = await import('node:module');
  const { pathToFileURL } = await import('node:url');
  const resolver = createRequire(import.meta.url);
  let panel = await fuente('./PanelSecciones.tsx');
  panel = panel.replace(/^import .* from '([^']+)';$/gm, (linea, ruta) => {
    if (ruta === 'react') return linea.replace("'react'", JSON.stringify(pathToFileURL(resolver.resolve('react')).href));
    if (ruta === './datos') return linea.replace("'./datos'", JSON.stringify(new URL('./datos.ts', import.meta.url).href));
    if (linea.startsWith('import type')) return '';
    if (ruta.endsWith('.css')) return 'const estilos = {};';
    if (ruta === './useMutacion') return 'const useMutacion = () => ({ ocupado: false, error: "", ejecutar() {} });';
    if (ruta === './asignaturas.api') return 'const asignaturasApi = {};';
    if (ruta === './PanelAsignatura') return 'const PanelAsignatura = ({ children }) => children;';
    if (ruta === './SelectorProfesor') return 'const SelectorProfesor = () => null;';
    throw new Error(ruta);
  });
  panel = 'import React from ' + JSON.stringify(pathToFileURL(resolver.resolve('react')).href) + ';\n' + panel;
  const compilado = ts.transpileModule(panel, { compilerOptions: { jsx: ts.JsxEmit.React, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  const { default: Panel } = await import(`data:text/javascript;base64,${Buffer.from(compilado).toString('base64')}`);
  const claves = new Set();
  for (const actual of [true, false]) for (const [estadoPlanificacion, etiqueta] of [['preparacion', 'Preparación'], ['propuesta', 'Propuesta'], ['publicado', 'Publicado'], [undefined, 'Estado no disponible']]) {
    const propiedades = { asignatura: { codigo: 'A', nombre: 'Álgebra' }, semestre: { id: 1, actual, estadoPlanificacion, codigo: '2026-2', carrera: { nombre: 'Informática' } } };
    claves.add(Panel(propiedades).key);
    const html = renderToStaticMarkup(React.createElement(Panel, propiedades));
    assert.ok(html.includes(etiqueta));
    assert.equal(html.includes('Solo lectura:'), !(actual && estadoPlanificacion === 'preparacion'));
    if (html.includes('Solo lectura:')) assert.match(html, /id="motivo-secciones" role="status"/);
    assert.match(html, /Cargando secciones y profesores/);
  }
  assert.equal(claves.size, 8, 'cada estado/actual tiene una instancia independiente');
});

test('estado de planificación: etiquetas, permiso estricto y motivos sin mutar entrada', async () => {
  const { estadoSecciones } = await import('./datos.ts');
  assert.equal(typeof estadoSecciones, 'function');
  const etiquetas = { preparacion: 'Preparación', propuesta: 'Propuesta', publicado: 'Publicado' };
  for (const actual of [true, false]) {
    for (const [estadoPlanificacion, etiqueta] of Object.entries(etiquetas)) {
      const entrada = Object.freeze({ actual, estadoPlanificacion });
      const resultado = estadoSecciones(entrada);
      assert.equal(resultado.etiqueta, etiqueta);
      assert.equal(resultado.puedeEditar, actual && estadoPlanificacion === 'preparacion');
      if (resultado.puedeEditar) assert.equal(resultado.motivo, '');
      else {
        assert.match(resultado.motivo, /[Ss]olo lectura/);
        if (!actual) assert.match(resultado.motivo, /no es la actual/);
        if (estadoPlanificacion !== 'preparacion') assert.match(resultado.motivo, /congeladas/);
        assert.match(resultado.motivo, /consultar|selecciona/i);
        assert.doesNotMatch(resultado.motivo, /generar|descartar/i);
      }
      assert.deepEqual(entrada, { actual, estadoPlanificacion });
    }
  }
  for (const entrada of [undefined, null, {}, { actual: true }, { actual: true, estadoPlanificacion: 'nuevo' },
    { actual: true, estadoPlanificacion: 'Preparación' }, { estadoPlanificacion: 'preparacion' },
    { actual: 'true', estadoPlanificacion: 'preparacion' }]) {
    assert.equal(estadoSecciones(entrada).puedeEditar, false);
    assert.match(estadoSecciones(entrada).motivo, /[Ss]olo lectura/);
  }
  assert.equal(estadoSecciones({ actual: true }).etiqueta, 'Estado no disponible');
});

test('conteos no mezclan carreras con asignatura y periodo compartidos', async () => {
  const { contarSecciones } = await import('./datos.ts');
  const ofertas = Object.freeze([
    { asignaturaCodigo: 'A', planificacionSemestreId: 1 },
    { asignaturaCodigo: 'A', planificacionSemestreId: 1 },
    { asignaturaCodigo: 'B', planificacionSemestreId: 1 },
    { asignaturaCodigo: 'A', planificacionSemestreId: 2 },
    { asignaturaCodigo: '__proto__', planificacionSemestreId: 1 },
  ].map(Object.freeze));
  assert.deepEqual([...contarSecciones(ofertas, 1)], [['A', 2], ['B', 1], ['__proto__', 1]]);
  assert.deepEqual([...contarSecciones(ofertas, 2)], [['A', 1]]);
  assert.equal(contarSecciones(ofertas, 1).get('C') ?? 0, 0);
  assert.equal(contarSecciones(ofertas, null).size, 0);
  assert.equal(contarSecciones([], 1).size, 0);
});

test('limpiar filtros conserva la planificación seleccionada', async () => {
  const { limpiarFiltros } = await import('./datos.ts');
  const entrada = Object.freeze({ busqueda: 'álgebra', departamento: '2', malla: '4', planificacionSemestreId: 7 });
  assert.deepEqual(limpiarFiltros(entrada), { busqueda: '', departamento: '', malla: '', planificacionSemestreId: 7 });
  assert.equal(entrada.busqueda, 'álgebra');
  assert.equal(limpiarFiltros({ ...entrada, planificacionSemestreId: null }).planificacionSemestreId, null);
});

test('UI usa planificación, carrera visible y conteo desconocido distinto de cero', async () => {
  const pagina = await fuente('./AsignaturasPage.tsx');
  const api = await fuente('./asignaturas.api.ts');
  const selector = await fuente('./SelectorProfesor.tsx');
  assert.match(api, /leer<PlanificacionSemestre\[\]>\('planificaciones-semestres'\)/);
  assert.match(api, /ofertasPlanificacion:[\s\S]*?`ofertas-asignaturas\?planificacionSemestreId=\$\{planificacionSemestreId\}`/);
  assert.match(pagina, /asignaturasApi\.ofertasPlanificacion\(planificacionSemestreId\)/);
  assert.match(pagina, /p\.carrera\.nombre/);
  for (const texto of ['Limpiar filtros', 'Sin secciones', 'Cargando conteos', 'Conteo no disponible', 'Sin semestre', 'Reintentar conteos']) assert.ok(pagina.includes(texto));
  assert.doesNotMatch(pagina, /scope="col">Crítica/);
  assert.doesNotMatch(selector, /\(todos los departamentos\)/);
  assert.doesNotMatch(api, /\bsemestreId\b|'semestres'/);
});

test('carga real invalida cantidades, ignora lecturas tardías y permite reintentar', async () => {
  const pagina = await fuente('./AsignaturasPage.tsx');
  const cuerpo = pagina.match(/const cargarConteos = useCallback\(async \(\) => \{([\s\S]*?)\n  \}, \[planificacionSemestreId, usuario\?\.id\]\);/)?.[1];
  assert.ok(cuerpo, 'localiza el callback ejecutado por React');
  const { contarSecciones } = await import('./datos.ts');
  let estado;
  const pendientes = [];
  const solicitudConteos = { current: 0 };
  const api = { ofertasPlanificacion: planificacionSemestreId => new Promise((resolve, reject) => pendientes.push({ planificacionSemestreId, resolve, reject })) };
  const crearCarga = (planificacionSemestreId, usuario) => new Function('solicitudConteos', 'planificacionSemestreId', 'usuario',
    'setConteos', 'asignaturasApi', 'contarSecciones', `return async () => {${cuerpo}}`)(
    solicitudConteos, planificacionSemestreId, usuario, valor => { estado = valor; }, api, contarSecciones);
  const anterior = crearCarga(1, { id: 10 })();
  const actual = crearCarga(2, { id: 20 })();
  assert.equal(estado.estado, 'cargando');
  assert.deepEqual(pendientes.map(p => p.planificacionSemestreId), [1, 2]);
  pendientes[1].resolve([{ asignaturaCodigo: 'A', planificacionSemestreId: 2 }]);
  await actual;
  assert.equal(estado.cantidades.get('A'), 1);
  pendientes[0].resolve([]);
  await anterior;
  assert.equal(estado.usuarioId, 20);
  assert.equal(estado.planificacionSemestreId, 2);
  assert.equal(estado.cantidades.get('A'), 1);
  const fallida = crearCarga(2, { id: 20 })();
  assert.equal(estado.estado, 'cargando');
  assert.equal(estado.cantidades, undefined);
  pendientes[2].reject(new Error('Sin conexión'));
  await fallida;
  assert.equal(estado.estado, 'error');
  assert.equal(estado.mensaje, 'Sin conexión');
  assert.equal(estado.cantidades, undefined);
  const reintento = crearCarga(2, { id: 20 })();
  pendientes[3].resolve([]);
  await reintento;
  assert.equal(estado.estado, 'listo');
  assert.equal(estado.cantidades.size, 0);
  const desmontada = crearCarga(2, { id: 20 })();
  solicitudConteos.current++;
  pendientes[4].resolve([]);
  await desmontada;
  assert.equal(estado.estado, 'cargando');
  await crearCarga(null, { id: 20 })();
  assert.equal(estado, null);
  assert.equal(pendientes.length, 5);
});

test('mutaciones notifican al padre sin recargar catálogo ni desmontar panel', async () => {
  const panel = await fuente('./PanelSecciones.tsx');
  const pagina = await fuente('./AsignaturasPage.tsx');
  assert.match(panel, /function completar\(\)\s*\{\s*if \(!vigente.current\) return;\s*alCambiarOfertas\(\)/);
  assert.match(pagina, /alCambiarOfertas=\{[\s\S]*?cargarConteos/);
  assert.match(pagina, /numero === solicitudConteos\.current/);
  assert.match(pagina, /return \(\) => \{ solicitudConteos\.current\+\+; \}/);
  assert.match(pagina, /conteos\?\.usuarioId === usuario\?\.id && conteos\?\.planificacionSemestreId === planificacionSemestreId/);
});

// Exercise the component's real event handlers with deterministic hook state.
async function componenteConEstado(ruta, nombre = 'default') {
  const ts = await import('typescript');
  const React = await import('react');
  const datos = await import('./datos.ts');
  const estados = [];
  let cursor = 0;
  const react = { ...React,
    useState(inicial) {
      const indice = cursor++;
      if (!(indice in estados)) estados[indice] = typeof inicial === 'function' ? inicial() : inicial;
      return [estados[indice], valor => { estados[indice] = typeof valor === 'function' ? valor(estados[indice]) : valor; }];
    },
    useId: () => 'selector-prueba', useEffect() {}, useRef: valor => ({ current: valor }),
  };
  const exportaciones = {};
  const requerir = modulo => {
    if (modulo === 'react') return react;
    if (modulo === './datos') return datos;
    if (modulo === './useMutacion') return { useMutacion: () => ({ ocupado: false, error: '', ejecutar() {} }) };
    if (modulo === './asignaturas.api') return { asignaturasApi: {} };
    if (modulo === './PanelAsignatura') return { __esModule: true, default: ({ children }) => React.createElement('div', null, children) };
    if (modulo === './SelectorProfesor') return { __esModule: true, default: () => null };
    if (modulo.endsWith('.css')) return {};
    throw new Error(modulo);
  };
  const codigo = ts.transpileModule(`import React from 'react';\n${await fuente(ruta)}`, {
    compilerOptions: { jsx: ts.JsxEmit.React, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  new Function('require', 'exports', codigo)(requerir, exportaciones);
  return propiedades => { cursor = 0; return exportaciones[nombre](propiedades); };
}
function elementos(arbol, condicion) {
  if (!arbol || typeof arbol !== 'object') return [];
  const hijos = Array.isArray(arbol.props?.children) ? arbol.props.children.flat(Infinity) : [arbol.props?.children];
  return [...(condicion(arbol) ? [arbol] : []), ...hijos.flatMap(hijo => elementos(hijo, condicion))];
}
function textoElemento(elemento) {
  if (elemento == null || typeof elemento === 'boolean') return '';
  if (Array.isArray(elemento)) return elemento.map(textoElemento).join('');
  return typeof elemento === 'object' ? textoElemento(elemento.props?.children) : String(elemento);
}
const botonConTexto = (arbol, texto) => elementos(arbol, e => e.type === 'button' && textoElemento(e) === texto)[0];

test('section loading restricts teacher selection and submission to the subject department', async () => {
  const panel = await fuente('./PanelSecciones.tsx');
  const cuerpo = panel.match(/const cargar = useCallback\(async \(\) => \{([\s\S]*?)\n  \}, \[/)?.[1];
  assert.ok(cuerpo);
  assert.match(panel, /\[asignatura\.codigo, asignatura\.departamentoId, semestre\.id\]/);
  const { ofertasDePlanificacion, prepararOferta } = await import('./datos.ts');
  const profesores = Object.freeze([
    { id: 1, nombre: 'Ana Uno', rut: '1-9', departamento: { id: 4, nombre: 'Informática' } },
    { id: 2, nombre: 'Ana Dos', rut: '2-7', departamento: { id: 5, nombre: 'Matemática' } },
  ].map(Object.freeze));
  for (const departamentoId of [4, 5, 6]) {
    let datos;
    const errores = [];
    const cargar = new Function('solicitud', 'setCargando', 'setDatos', 'setErrorCarga', 'asignaturasApi',
      'asignatura', 'semestre', 'ofertasDePlanificacion', `return async () => {${cuerpo}}`)(
      { current: 0 }, () => {}, valor => { datos = valor; }, valor => { if (valor) errores.push(valor); },
      { ofertas: async () => [], profesores: async () => profesores },
      { codigo: 'A', departamentoId }, { id: 3 }, ofertasDePlanificacion);
    await cargar();
    assert.deepEqual(errores, []);
    assert.deepEqual(datos.profesores.map(p => p.id), profesores.filter(p => p.departamento.id === departamentoId).map(p => p.id));
    assert.equal(profesores.length, 2, 'the global catalogue is not modified');
    for (const profesor of profesores) {
      const entrada = { seccion: '1', cupos: '0', asignaciones: [{ tipoHoraId: 1, profesorId: profesor.id }] };
      if (profesor.departamento.id === departamentoId) {
        assert.deepEqual(prepararOferta(entrada, datos.profesores, [1]).asignaciones, entrada.asignaciones);
      } else {
        assert.throws(() => prepararOferta(entrada, datos.profesores, [1]), /profesor válido/);
      }
    }
    assert.deepEqual(prepararOferta({ seccion: '1', cupos: '0', asignaciones: [] }, datos.profesores, [1]).asignaciones, []);
    for (const busqueda of ['Ana', '2-7']) {
      const renderizar = await componenteConEstado('./SelectorProfesor.tsx');
      const propiedades = { profesores: datos.profesores, profesorId: null, alSeleccionar() {} };
      elementos(renderizar(propiedades), e => e.type === 'input')[0].props.onChange({ target: { value: busqueda } });
      const sugerencias = elementos(renderizar(propiedades), e => e.props?.role === 'option').map(textoElemento).join(' ');
      for (const profesor of datos.profesores.filter(p => busqueda === 'Ana' || p.id === 2)) {
        assert.ok(sugerencias.includes(profesor.nombre), 'eligible teachers remain selectable by name and RUT');
      }
      for (const profesor of profesores.filter(p => p.departamento.id !== departamentoId)) {
        assert.ok(!sugerencias.includes(profesor.nombre));
      }
    }
  }
});

test('editing a subject displays its hour breakdown without adding editable hour controls', async () => {
  const renderizar = await componenteConEstado('./EditarAsignatura.tsx');
  const { renderToStaticMarkup } = await import('react-dom/server');
  const asignatura = { codigo: 'A', nombre: 'Álgebra', departamentoId: 1, semestreMalla: 2, esCritica: false,
    tiposHora: [{ tipoHoraId: 1, horas: 4, tipoHora: { tipo: 'Teoría' } }, { tipoHoraId: 2, horas: 2, tipoHora: { tipo: 'Práctica' } }] };
  const arbol = renderizar({ asignatura, departamentos: [{ id: 1, nombre: 'Departamento' }], alCerrar() {}, alCompletar() {} });
  const html = renderToStaticMarkup(arbol);
  assert.match(html, /Horas por tipo/);
  assert.match(html, /Teoría/); assert.match(html, /4 h/);
  assert.match(html, /Práctica/); assert.match(html, /2 h/);
  assert.equal(elementos(arbol, e => e.type === 'input' && e.props.type === 'number').length, 1, 'only curriculum semester is editable');
  const vacia = renderToStaticMarkup(renderizar({ asignatura: { ...asignatura, tiposHora: [] }, departamentos: [], alCerrar() {}, alCompletar() {} }));
  assert.match(vacia, /Sin tipos de hora registrados/);
});

test('teacher autocomplete selects a suggestion and can be cleared and rewritten directly', async () => {
  const renderizar = await componenteConEstado('./SelectorProfesor.tsx');
  const profesores = [{ id: 1, nombre: 'Ana', rut: '1-9', departamento: { nombre: 'A' } },
    { id: 2, nombre: 'Pedro', rut: '2-7', departamento: { nombre: 'B' } }];
  const cambios = [];
  let profesorId = 1;
  const dibujar = () => renderizar({ profesores, profesorId, contexto: 'Teoría', alSeleccionar: valor => { cambios.push(valor); profesorId = valor; } });
  let arbol = dibujar();
  let entrada = elementos(arbol, e => e.type === 'input')[0];
  assert.equal(entrada.props.value, 'Ana');
  assert.equal(elementos(arbol, e => e.type === 'button').length, 0, 'no extra assign/change/remove controls');
  const etiqueta = elementos(arbol, e => e.type === 'label' && e.props.htmlFor === entrada.props.id)[0];
  assert.match(textoElemento(etiqueta), /Teoría/);
  entrada.props.onChange({ target: { value: 'Pedro' } });
  assert.deepEqual(cambios, [null], 'editing makes the field pending until a suggestion is selected');
  arbol = dibujar();
  assert.equal(elementos(arbol, e => e.type === 'input')[0].props.value, 'Pedro');
  const pedro = elementos(arbol, e => e.type === 'button' && textoElemento(e).includes('Pedro'))[0];
  assert.match(textoElemento(pedro), /2-7/); assert.match(textoElemento(pedro), /B/);
  pedro.props.onClick();
  assert.deepEqual(cambios, [null, 2]);
  arbol = dibujar();
  entrada = elementos(arbol, e => e.type === 'input')[0];
  assert.equal(entrada.props.value, 'Pedro');
  assert.equal(entrada.props['aria-expanded'], false);
  entrada.props.onChange({ target: { value: '' } });
  assert.deepEqual(cambios, [null, 2, null]);
  arbol = dibujar();
  assert.equal(elementos(arbol, e => e.type === 'input')[0].props.value, '');
  assert.equal(elementos(arbol, e => e.props?.role === 'listbox').length, 0);
  profesorId = 1;
  assert.equal(elementos(dibujar(), e => e.type === 'input')[0].props.value, 'Ana', 'parent autofill is reflected in the input');
});

test('the first typed selection fills only empty lower rows and each remains independently editable', async () => {
  const renderizar = await componenteConEstado('./PanelSecciones.tsx', 'EditorAsignaciones');
  const tiposHora = ['Teoría', 'Práctica', 'Laboratorio'].map((tipo, indice) => ({ tipoHoraId: indice + 1, horas: 2, tipoHora: { tipo } }));
  const profesores = [{ id: 1, nombre: 'Ana' }, { id: 2, nombre: 'Pedro' }];
  let asignaciones = [{ tipoHoraId: 2, profesorId: 1 }, { tipoHoraId: 3, profesorId: null }];
  const cambios = [];
  const dibujar = () => renderizar({ asignatura: { tiposHora }, profesores, asignaciones,
    alCambiar: valor => { asignaciones = valor; cambios.push(valor); } });
  let arbol = dibujar();
  const teoria = elementos(arbol, e => e.props?.contexto === 'Teoría')[0];
  teoria.props.alSeleccionar(2);
  assert.deepEqual([...asignaciones].sort((a,b) => a.tipoHoraId-b.tipoHoraId), [{ tipoHoraId: 1, profesorId: 2 }, { tipoHoraId: 2, profesorId: 1 }, { tipoHoraId: 3, profesorId: 2 }]);
  arbol = dibujar();
  assert.equal(elementos(arbol, e => e.props?.contexto === 'Práctica')[0].props.profesorId, 1);
  elementos(arbol, e => e.props?.contexto === 'Práctica')[0].props.alSeleccionar(null);
  arbol = dibujar();
  assert.equal(elementos(arbol, e => e.props?.contexto === 'Práctica')[0].props.profesorId, null);
  assert.equal(elementos(arbol, e => e.props?.contexto === 'Laboratorio')[0].props.profesorId, 2);
  elementos(arbol, e => e.props?.contexto === 'Práctica')[0].props.alSeleccionar(1);
  assert.equal(asignaciones.find(a => a.tipoHoraId === 3).profesorId, 2);
  asignaciones = [];
  arbol = dibujar();
  elementos(arbol, e => e.props?.contexto === 'Teoría')[0].props.alSeleccionar(2);
  assert.deepEqual([...asignaciones].sort((a,b) => a.tipoHoraId-b.tipoHoraId), tiposHora.map(t => ({ tipoHoraId: t.tipoHoraId, profesorId: 2 })));
  assert.equal(elementos(dibujar(), e => e.type === 'details' || (e.type === 'input' && e.props.type === 'checkbox')).length, 0);
  elementos(dibujar(), e => e.props?.contexto === 'Teoría')[0].props.alSeleccionar(null);
  assert.equal(asignaciones.find(a => a.tipoHoraId === 2).profesorId, 2, 'clearing first row does not erase lower rows');
});

test('autocomplete supports keyboard choice and never assigns unmatched text', async () => {
  const renderizar = await componenteConEstado('./SelectorProfesor.tsx');
  const profesores = [{ id: 1, nombre: 'Ana', rut: '1-9', departamento: { nombre: 'A' } },
    { id: 2, nombre: 'Pedro', rut: '2-7', departamento: { nombre: 'B' } }];
  let profesorId = null;
  const cambios = [];
  const dibujar = () => renderizar({ profesores, profesorId, contexto: 'Práctica', alSeleccionar: valor => { profesorId = valor; cambios.push(valor); } });
  const entrada = () => elementos(dibujar(), e => e.type === 'input')[0];
  entrada().props.onChange({ target: { value: 'desconocido' } });
  let prevenido = false;
  entrada().props.onKeyDown({ key: 'Enter', preventDefault() { prevenido = true; } });
  assert.equal(prevenido, true); assert.deepEqual(cambios, []);
  assert.match(textoElemento(dibujar()), /No hay profesores/);
  entrada().props.onChange({ target: { value: '2-7' } });
  const listado = elementos(dibujar(), e => e.props?.role === 'listbox')[0];
  assert.equal(entrada().props['aria-controls'], listado.props.id);
  entrada().props.onKeyDown({ key: 'ArrowDown', preventDefault() {} });
  entrada().props.onKeyDown({ key: 'Enter', preventDefault() {} });
  assert.deepEqual(cambios, [2]);
  assert.equal(entrada().props.value, 'Pedro');
  entrada().props.onChange({ target: { value: 'Ana' } });
  entrada().props.onKeyDown({ key: 'Escape' });
  assert.equal(entrada().props['aria-expanded'], false);
  assert.deepEqual(cambios, [2, null]);
  entrada().props.onFocus();
  assert.equal(entrada().props['aria-expanded'], true);
  entrada().props.onBlur();
  assert.equal(entrada().props['aria-expanded'], false);
});
