import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const fuente = ruta => readFile(new URL(ruta, import.meta.url), 'utf8');

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
  assert.match(panel, /function completar\(\)\s*\{\s*alCambiarOfertas\(\)/);
  assert.match(pagina, /alCambiarOfertas=\{[\s\S]*?cargarConteos/);
  assert.match(pagina, /numero === solicitudConteos\.current/);
  assert.match(pagina, /return \(\) => \{ solicitudConteos\.current\+\+; \}/);
  assert.match(pagina, /conteos\?\.usuarioId === usuario\?\.id && conteos\?\.planificacionSemestreId === planificacionSemestreId/);
});
