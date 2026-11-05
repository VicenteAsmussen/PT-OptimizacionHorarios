import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// Ejecuta el manejador de la página con la API HTTP real y un transporte simulado.
async function prepararImportacion(respuesta) {
  const ts = await import('typescript');
  const { api, ApiError } = await import('../../lib/api.ts');
  const pagina = (await readFile(new URL('./HorariosExternosPage.tsx', import.meta.url), 'utf8')).replace(/\r\n/g, '\n');
  const fuente = pagina.match(/  async function importar\(\) \{[^]*?\n  \}/)?.[0];
  assert.ok(fuente);
  const anterior = [{ codigo: 'ANTERIOR', estado: 'cargada', secciones: [3] }];
  const estado = { resultado: null, errores: [], mensaje: '', rechazado: false, importando: false,
    archivo: new Blob(['planilla simulada']), confirmado: true, actualizacion: 0 };
  const solicitudes = [];
  const setters = ['Importando', 'Mensaje', 'Resultado', 'Errores', 'Rechazado', 'Archivo', 'Confirmado', 'Actualizacion'];
  const nombres = setters.map(nombre => `set${nombre}`);
  const valores = setters.map(nombre => valor => {
    const clave = nombre[0].toLowerCase() + nombre.slice(1);
    estado[clave] = typeof valor === 'function' ? valor(estado[clave]) : valor;
  });
  const enviando = { current: false };
  const apiPagina = { importar: (planificacionId, departamentoId, archivo) => {
    const cuerpo = new FormData(); cuerpo.append('archivo', archivo, 'externos.xlsx');
    return api(`horarios/excel/externos?planificacionSemestreId=${planificacionId}&departamentoId=${departamentoId}`, { method: 'POST', body: cuerpo });
  } };
  const importar = new Function('enviando', 'archivo', 'confirmado', 'editable', 'persistida',
    'planificacionId', 'departamentoId', 'horariosExternosApi', 'vigente', 'controlArchivo', 'resumen', 'ApiError', ...nombres,
    ts.transpileModule(`${fuente}\nreturn importar;`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText)(
    enviando, estado.archivo, true, true, anterior, 7, 6, apiPagina, { current: true }, { current: null },
    { current: { focus() {} } }, ApiError, ...valores);
  const fetchAnterior = globalThis.fetch;
  globalThis.fetch = async (ruta, opciones) => {
    solicitudes.push({ ruta, opciones });
    if (respuesta instanceof Error) throw respuesta;
    return new Response(JSON.stringify(respuesta.cuerpo), { status: respuesta.status, headers: { 'Content-Type': 'application/json' } });
  };
  try { await importar(); } finally { globalThis.fetch = fetchAnterior; }
  assert.equal(enviando.current, false);
  assert.equal(estado.importando, false);
  assert.equal(solicitudes.length, 1);
  assert.equal(solicitudes[0].opciones.credentials, 'include');
  assert.deepEqual(anterior, [{ codigo: 'ANTERIOR', estado: 'cargada', secciones: [3] }]);
  return { estado, pagina };
}

test('una reserva recibida por HTTP muestra fila, columna y motivo sin anunciar éxito ni sustituir la carga guardada', async () => {
  const React = await import('react');
  const ts = await import('typescript');
  const { renderToStaticMarkup } = await import('react-dom/server');
  const error = { fila: 4, columna: 'Horario 1', valor: 'Martes 10:30-11:50',
    codigoAsignatura: 'MAT101', nombreAsignatura: 'Matemática', mensaje: 'La sesión incluye un bloque reservado para esta carrera.' };
  const { estado, pagina } = await prepararImportacion({ status: 400, cuerpo: { message: 'Archivo rechazado', errores: [error] } });
  assert.deepEqual(estado.errores, [error]);
  assert.equal(estado.rechazado, true);
  assert.equal(estado.resultado, null);
  assert.equal(estado.actualizacion, 0);
  assert.ok(estado.archivo);
  assert.match(estado.mensaje, /No se guardó ninguna fila ni se modificó la carga anterior/);
  assert.doesNotMatch(estado.mensaje, /completada|correctamente/);
  const tabla = pagina.match(/<table className=\{base.tabla\}><caption>Corrige estos errores[^]*?<\/table>/)?.[0];
  assert.ok(tabla);
  const renderizar = new Function('React', 'base', 'errores', ts.transpileModule(`return (${tabla});`, {
    compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 },
  }).outputText);
  const html = renderToStaticMarkup(renderizar(React, {}, estado.errores));
  for (const texto of ['MAT101', 'Matemática', '<td>4</td>', 'Horario 1', error.valor, error.mensaje]) assert.ok(html.includes(texto), texto);
});

for (const [nombre, respuesta] of [
  ['conflicto sin detalle de fila', { status: 409, cuerpo: { message: 'El horario ocupa un bloque reservado para esta carrera.' } }],
  ['respuesta perdida', new TypeError('Error de red')],
]) test(`la importación con ${nombre} no inventa filas ni afirma reversión`, async () => {
  const { estado } = await prepararImportacion(respuesta);
  assert.deepEqual(estado.errores, []);
  assert.equal(estado.rechazado, false);
  assert.equal(estado.resultado, null);
  assert.equal(estado.actualizacion, 1);
  assert.match(estado.mensaje, /Consulta la carga guardada antes de reintentar/);
  assert.doesNotMatch(estado.mensaje, /No se guardó ninguna fila|completada/);
});

test('la importación confirmada conserva el flujo anterior de éxito y consulta actualizada', async () => {
  const resultado = { ofertasCreadas: 1, ofertasActualizadas: 0, ofertasEliminadas: 0, horariosCreados: 2, cobertura: [], errores: [] };
  const { estado } = await prepararImportacion({ status: 200, cuerpo: resultado });
  assert.deepEqual(estado.resultado, resultado);
  assert.equal(estado.rechazado, false);
  assert.deepEqual(estado.errores, []);
  assert.equal(estado.archivo, null);
  assert.equal(estado.confirmado, false);
  assert.equal(estado.actualizacion, 1);
  assert.match(estado.mensaje, /Importación completada/);
});

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
  const renderizar = new Function('ordenarPeriodosPorFechaAcademica', 'React', 'importando', 'planificacionId', 'datos',
    'limpiarArchivo', 'setPersistida', 'setDepartamentoId', 'setPlanificacionId', codigo)
    .bind(null, (await import('../../lib/periodos.ts')).ordenarPeriodosPorFechaAcademica);
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
  const pagina = (await readFile(new URL('./HorariosExternosPage.tsx', import.meta.url), 'utf8')).replace(/\r\n/g, '\n');
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
  const renderizar = new Function('ordenarPeriodosPorFechaAcademica', 'React', 'planificacionId', 'datos', ts.transpileModule(`return (${selector});`, {
    compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 },
  }).outputText).bind(null, (await import('../../lib/periodos.ts')).ordenarPeriodosPorFechaAcademica);
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
