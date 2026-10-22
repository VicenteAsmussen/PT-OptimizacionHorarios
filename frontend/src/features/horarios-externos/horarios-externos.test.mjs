import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('external department selection belongs to the selected career, not a global flag', async () => {
  const { departamentosExternos } = await import('./datos.ts');
  const departamentos = [{ id: 1, carreraDepartamentos: [{ carreraId: 2, esGestionado: false }, { carreraId: 1, esGestionado: true }] },
    { id: 2, carreraDepartamentos: [{ carreraId: 1, esGestionado: false }] }];
  assert.deepEqual(departamentosExternos(departamentos, 1).map(d => d.id), [2]);
  assert.deepEqual(departamentosExternos(departamentos, undefined), []);
});
test('coverage colors distinguish loaded, mandatory missing, optional missing and invalid', async () => {
  const { presentacionCobertura } = await import('./datos.ts');
  assert.equal(presentacionCobertura('cargada', false).color, 'verde');
  assert.match(presentacionCobertura('cargada', true).texto, /sin guardar/);
  assert.equal(presentacionCobertura('faltante_obligatoria', false).color, 'rojo');
  assert.equal(presentacionCobertura('faltante_opcional', false).color, 'amarillo');
  assert.equal(presentacionCobertura('invalida', true).color, 'rojo');
});
test('current period is fixed, cannot be changed, and the page uses the requested title', async () => {
  const ts = await import('typescript');
  const React = await import('react');
  const { renderToStaticMarkup } = await import('react-dom/server');
  const pagina = await readFile(new URL('./HorariosExternosPage.tsx', import.meta.url), 'utf8');
  const selector = pagina.match(/<label>(?:Carrera y período|Período actual)<select[^]*?<\/select><\/label>/)?.[0];
  assert.ok(selector);
  const codigo = ts.transpileModule(`return (${selector});`, {
    compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const renderizar = new Function('React', 'importando', 'planificacionId', 'datos',
    'limpiarArchivo', 'setPersistida', 'setDepartamentoId', 'setPlanificacionId', codigo);
  const historica = { id: 6, actual: false, codigo: '2026-1', carrera: { nombre: 'Informatica' } };
  const futura = { id: 8, actual: false, codigo: '2027-1', carrera: { nombre: 'Informatica' } };
  const datos = { planificaciones: [historica,
    { id: 7, actual: true, codigo: '2026-2', carrera: { nombre: 'Informatica' } }, futura] };
  const seleccionado = renderizar(React, false, 7, datos, () => {}, () => {}, () => {}, () => {});
  const selectActual = React.Children.toArray(seleccionado.props.children).find(elemento => elemento.type === 'select');
  assert.equal(selectActual.props.disabled, true);
  assert.equal(selectActual.props.onChange, undefined);
  assert.match(renderToStaticMarkup(seleccionado), /<label>Período actual<select/);
  assert.doesNotMatch(renderToStaticMarkup(seleccionado), /<option value=""/);
  assert.match(renderToStaticMarkup(seleccionado), /<option value="7" selected=""/);
  assert.doesNotMatch(renderToStaticMarkup(seleccionado), /2026-1|2027-1|value="6"|value="8"/);
  const pendiente = renderizar(React, false, null, datos, () => {}, () => {}, () => {}, () => {});
  const select = React.Children.toArray(pendiente.props.children).find(elemento => elemento.type === 'select');
  const vacia = React.Children.toArray(select.props.children).find(opcion => opcion.props.value === '');
  assert.ok(vacia?.props.disabled);
  assert.ok(vacia?.props.hidden);
  const sinActual = renderizar(React, false, null, { planificaciones: [historica, futura] }, () => {}, () => {}, () => {}, () => {});
  const selectSinActual = React.Children.toArray(sinActual.props.children).find(elemento => elemento.type === 'select');
  assert.equal(selectSinActual.props.disabled, true);
  assert.doesNotMatch(renderToStaticMarkup(sinActual), /2026-1|2027-1/);
  assert.match(pagina, /<h1 id="titulo-horarios-externos">Horarios departamentos externos<\/h1>/);
  const layout = await readFile(new URL('../../components/layout/AppLayout.tsx', import.meta.url), 'utf8');
  assert.match(layout, />\s*Horarios departamentos externos\s*<\/NavLink>/);
});
test('coverage failures expose HTTP status instead of hiding missing-route responses', async () => {
  const { mensajeErrorCobertura } = await import('./datos.ts');
  assert.equal(typeof mensajeErrorCobertura, 'function');
  const fallo = Object.assign(new Error('No se pudo completar la solicitud.'), { status: 404 });
  assert.match(mensajeErrorCobertura(fallo), /HTTP 404/);
  assert.match(mensajeErrorCobertura(fallo), /backend/);
  assert.match(mensajeErrorCobertura(Object.assign(new Error('La planificación no pertenece a su carrera'), { status: 403 })), /carrera.*HTTP 403/);
});
test('reloading after the current semester changes uses the new planning for display and persisted coverage', async () => {
  const ts = await import('typescript');
  const React = await import('react');
  const { renderToStaticMarkup } = await import('react-dom/server');
  const { planificacionInicial } = await import('../asignaturas/datos.ts');
  const { cargarResumenDepartamentos, mensajeErrorCobertura } = await import('./datos.ts');
  const pagina = await readFile(new URL('./HorariosExternosPage.tsx', import.meta.url), 'utf8');
  const carga = pagina.match(/  useEffect\(\(\) => \{\n    let activo = true;\n    setDatos\(null\);[^]*?\n  \}, \[intento\]\);/)?.[0];
  const cobertura = pagina.match(/  useEffect\(\(\) => \{\n    let activo = true;\n    setPersistida\(null\);[^]*?\n  \}, \[planificacionId, departamentoId, actualizacion\]\);/)?.[0];
  const selector = pagina.match(/<label>Período actual<select[^]*?<\/select><\/label>/)?.[0];
  assert.ok(carga); assert.ok(cobertura); assert.ok(selector);
  const compilarEfecto = (fuente, parametros) => {
    const cuerpo = fuente.replace(/^  useEffect\(\(\) => \{\n/, '').replace(/\n  \}, \[[^\]]*\]\);$/, '');
    return new Function(...parametros, ts.transpileModule(cuerpo, {
      compilerOptions: { target: ts.ScriptTarget.ES2022 },
    }).outputText);
  };
  const cargar = compilarEfecto(carga, ['horariosExternosApi', 'planificacionInicial', 'setDatos', 'setErrorCarga', 'setPlanificacionId']);
  const consultar = compilarEfecto(cobertura, ['planificacionId', 'departamentoId', 'horariosExternosApi', 'setPersistida', 'setErrorCobertura', 'mensajeErrorCobertura']);
  const renderizar = new Function('React', 'planificacionId', 'datos', ts.transpileModule(`return (${selector});`, {
    compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 },
  }).outputText);
  const departamentos = [{ id: 6, nombre: 'Matemática', carreraDepartamentos: [{ carreraId: 1, esGestionado: false }] }];
  const carrera = { id: 1, nombre: 'Informatica' };
  let planificaciones = [
    { id: 7, carreraId: 1, carrera, codigo: '2026-2', actual: true, estadoPlanificacion: 'preparacion' },
    { id: 8, carreraId: 1, carrera, codigo: '2027-1', actual: false, estadoPlanificacion: 'preparacion' },
  ];
  const consultas = [];
  const api = {
    planificaciones: async () => structuredClone(planificaciones),
    departamentos: async () => departamentos,
    cobertura: async (planificacionId, departamentoId) => {
      consultas.push([planificacionId, departamentoId]);
      return { cobertura: [{ codigo: planificacionId === 7 ? 'PAR' : 'IMPAR',
        estado: planificacionId === 7 ? 'cargada' : 'faltante_obligatoria', secciones: planificacionId === 7 ? [1] : [] }] };
    },
  };
  const esperar = () => new Promise(resolve => setImmediate(resolve));
  let datos = null; let planificacionId = null; let persistida = null; let error = '';
  const montar = () => cargar(api, planificacionInicial, valor => { datos = valor; },
    valor => { error = valor; }, valor => { planificacionId = valor; });
  const leerCobertura = () => consultar(planificacionId, 6, api, valor => { persistida = valor; },
    valor => { error = valor; }, mensajeErrorCobertura);

  const desmontarPrimera = montar(); await esperar();
  assert.equal(planificacionId, 7);
  assert.match(renderToStaticMarkup(renderizar(React, planificacionId, datos)), /value="7" selected=""[^]*2026-2/);
  const cancelarPrimera = leerCobertura(); await esperar();
  assert.deepEqual(persistida.map(asignatura => asignatura.codigo), ['PAR']);
  assert.deepEqual(await cargarResumenDepartamentos(planificacionId, departamentos, api.cobertura), [
    { departamentoId: 6, nombre: 'Matemática', cargadas: 1, total: 1 },
  ]);

  cancelarPrimera(); desmontarPrimera();
  planificaciones = planificaciones.map(planificacion => ({ ...planificacion, actual: planificacion.id === 8 }));
  datos = null; planificacionId = null; persistida = null;
  const desmontarSegunda = montar(); await esperar();
  assert.equal(planificacionId, 8);
  const elemento = renderizar(React, planificacionId, datos);
  const html = renderToStaticMarkup(elemento);
  assert.match(html, /value="8" selected=""[^]*2027-1/);
  assert.doesNotMatch(html, /2026-2|value="7"/);
  const campo = React.Children.toArray(elemento.props.children).find(elemento => elemento.type === 'select');
  assert.equal(campo.props.disabled, true);
  assert.equal(campo.props.onChange, undefined);
  const cancelarSegunda = leerCobertura(); await esperar();
  assert.deepEqual(persistida.map(asignatura => asignatura.codigo), ['IMPAR']);
  assert.deepEqual(await cargarResumenDepartamentos(planificacionId, departamentos, api.cobertura), [
    { departamentoId: 6, nombre: 'Matemática', cargadas: 0, total: 1 },
  ]);
  assert.deepEqual(consultas, [[7, 6], [7, 6], [8, 6], [8, 6]]);
  assert.equal(error, '');
  cancelarSegunda(); desmontarSegunda();
});
