import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const fuente = ruta => readFile(new URL(ruta, import.meta.url), 'utf8');

test('conteos agrupan el semestre seleccionado sin mezclar asignaturas ni semestres', async () => {
  const { contarSecciones } = await import('./datos.ts');
  const ofertas = Object.freeze([
    { asignaturaCodigo: 'A', semestreId: 1 },
    { asignaturaCodigo: 'A', semestreId: 1 },
    { asignaturaCodigo: 'B', semestreId: 1 },
    { asignaturaCodigo: 'A', semestreId: 2 },
    { asignaturaCodigo: '__proto__', semestreId: 1 },
  ].map(Object.freeze));
  assert.deepEqual([...contarSecciones(ofertas, 1)], [['A', 2], ['B', 1], ['__proto__', 1]]);
  assert.deepEqual([...contarSecciones(ofertas, 2)], [['A', 1]]);
  assert.equal(contarSecciones(ofertas, 1).get('C') ?? 0, 0);
  assert.equal(contarSecciones(ofertas, null).size, 0);
  assert.equal(contarSecciones([], 1).size, 0);
});

test('limpiar filtros restablece búsqueda, departamento y malla conservando semestre', async () => {
  const { limpiarFiltros } = await import('./datos.ts');
  const entrada = Object.freeze({ busqueda: 'álgebra', departamento: '2', malla: '4', semestreId: 7 });
  assert.deepEqual(limpiarFiltros(entrada), { busqueda: '', departamento: '', malla: '', semestreId: 7 });
  assert.equal(entrada.busqueda, 'álgebra');
  assert.equal(limpiarFiltros({ ...entrada, semestreId: null }).semestreId, null);
});

test('UI carga por semestre y mantiene desconocido distinto de cero; selector sin calificador', async () => {
  const pagina = await fuente('./AsignaturasPage.tsx');
  const api = await fuente('./asignaturas.api.ts');
  const selector = await fuente('./SelectorProfesor.tsx');
  assert.match(api, /ofertasSemestre:[\s\S]*?`ofertas-asignaturas\?semestreId=\$\{semestreId\}`/);
  assert.match(pagina, /asignaturasApi\.ofertasSemestre\(semestreId\)/);
  assert.match(pagina, /Limpiar filtros/);
  assert.match(pagina, /Sin secciones/);
  assert.match(pagina, /Cargando conteos/);
  assert.match(pagina, /Conteo no disponible/);
  assert.match(pagina, /Sin semestre/);
  assert.match(pagina, /Reintentar conteos/);
  assert.doesNotMatch(pagina, /scope="col">Crítica/);
  assert.doesNotMatch(selector, /\(todos los departamentos\)/);
});

test('carga real invalida cantidades, ignora lecturas tardías y permite reintentar tras fallo', async () => {
  const pagina = await fuente('./AsignaturasPage.tsx');
  const cuerpo = pagina.match(/const cargarConteos = useCallback\(async \(\) => \{([\s\S]*?)\n  \}, \[semestreId, usuario\?\.id\]\);/)?.[1];
  assert.ok(cuerpo, 'localiza el callback de carga ejecutado por React');
  const { contarSecciones } = await import('./datos.ts');
  let estado;
  const pendientes = [];
  const solicitudConteos = { current: 0 };
  const api = { ofertasSemestre: semestreId => new Promise((resolve, reject) => pendientes.push({ semestreId, resolve, reject })) };
  const crearCarga = (semestreId, usuario) => new Function('solicitudConteos', 'semestreId', 'usuario',
    'setConteos', 'asignaturasApi', 'contarSecciones', `return async () => {${cuerpo}}`)(
    solicitudConteos, semestreId, usuario, valor => { estado = valor; }, api, contarSecciones);
  const anterior = crearCarga(1, { id: 10 })();
  const actual = crearCarga(2, { id: 20 })();
  assert.equal(estado.estado, 'cargando');
  assert.deepEqual(pendientes.map(p => p.semestreId), [1, 2]);
  pendientes[1].resolve([{ asignaturaCodigo: 'A', semestreId: 2 }]);
  await actual;
  assert.equal(estado.cantidades.get('A'), 1);
  pendientes[0].resolve([]);
  await anterior;
  assert.equal(estado.usuarioId, 20);
  assert.equal(estado.semestreId, 2);
  assert.equal(estado.cantidades.get('A'), 1, 'respuesta anterior no sobrescribe la nueva');
  const fallida = crearCarga(2, { id: 20 })();
  assert.equal(estado.estado, 'cargando');
  assert.equal(estado.cantidades, undefined, 'el refresco no conserva conteos obsoletos');
  pendientes[2].reject(new Error('Sin conexión'));
  await fallida;
  assert.equal(estado.estado, 'error');
  assert.equal(estado.mensaje, 'Sin conexión');
  assert.equal(estado.cantidades, undefined);
  const reintento = crearCarga(2, { id: 20 })();
  pendientes[3].resolve([]);
  await reintento;
  assert.equal(estado.estado, 'listo');
  assert.equal(estado.cantidades.size, 0, 'solo éxito vacío representa cero');
  const desmontada = crearCarga(2, { id: 20 })();
  solicitudConteos.current++;
  pendientes[4].resolve([]);
  await desmontada;
  assert.equal(estado.estado, 'cargando', 'no escribe tras invalidar/desmontar');
  await crearCarga(null, { id: 20 })();
  assert.equal(estado, null);
  assert.equal(pendientes.length, 5, 'sin semestre no se consulta');
});

test('mutaciones notifican al padre sin recargar catálogo ni desmontar panel', async () => {
  const panel = await fuente('./PanelSecciones.tsx');
  const pagina = await fuente('./AsignaturasPage.tsx');
  assert.match(panel, /function completar\(\)\s*\{\s*alCambiarOfertas\(\)/);
  assert.match(pagina, /alCambiarOfertas=\{[\s\S]*?cargarConteos/);
  assert.match(pagina, /numero === solicitudConteos\.current/);
  assert.match(pagina, /return \(\) => \{ solicitudConteos\.current\+\+; \}/);
  assert.match(pagina, /conteos\?\.usuarioId === usuario\?\.id && conteos\?\.semestreId === semestreId/);
});
