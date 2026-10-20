import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const fuente = ruta => readFile(new URL(ruta, import.meta.url), 'utf8');

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
      const accion = { tipo, oferta: { id: 9, seccion: 1, cupos: 0, profesorId: 1 } };
      const contexto = {
        vigente, puedeEditar: estadoSecciones({ actual, estadoPlanificacion }).puedeEditar, ocupado: false,
        accion, datos: { profesores: [] }, libres: [1], seccion: '1', cupos: '0', profesorId: 1,
        asignatura: { codigo: 'A' }, semestre: { id: 2 }, contenido: { current: null },
        setAccion: valor => llamadas.push(['accion', valor]), setSeccion() {}, setCupos() {}, setProfesorId() {},
        setGuardado: () => llamadas.push(['guardado']), cargar: () => llamadas.push(['cargar']),
        alCambiarOfertas: () => llamadas.push(['conteos']),
        prepararOferta: () => ({ seccion: 1, cupos: 0, profesorId: 1 }),
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
