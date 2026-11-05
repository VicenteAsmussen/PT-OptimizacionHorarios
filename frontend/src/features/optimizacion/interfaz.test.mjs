import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { setImmediate as turno } from 'node:timers/promises';
import { registerHooks } from 'node:module';
import React from 'react';
import ts from 'typescript';
import { renderToStaticMarkup } from 'react-dom/server';
registerHooks({ resolve(nombre, contexto, siguiente) {
  return siguiente(contexto.parentURL?.includes('/frontend/src/') && nombre.startsWith('.') && !/\.[a-z]+$/i.test(nombre) ? `${nombre}.ts` : nombre, contexto);
} });
const modelo = await import('./modelo.ts');
const { crearSeguimiento } = await import('./seguimiento.ts');
const { estadoSecciones, planificacionInicial } = await import('../asignaturas/datos.ts');
const recurso = { id: 'AC-Sala-32', edificio: 'AC', tipo: 'Sala', capacidad: 32, cantidad: 2, fuente: 'Catálogo acreditado' };
const preparar = () => ({ planificacion: { id: 2 }, puedeEjecutar: true, bloqueos: [], ejecucionActivaId: null,
  revisionEntrada: 'revision-consultada', categoriasSalas: [{ ...recurso, cantidadCatalogo: 4, cantidadSugerida: 2 }], diagnosticosCatalogo: [],
  laboratorios: { requiereDeclaracion: false, mensaje: 'Declare el total departamental por capacidad.' }, limiteSolverSegundos: 300, disponibilidadDocente: [], advertencia: 'Sugerencias sin garantía de disponibilidad.' });
const ejecutar = estado => ({ id: 'e1', planificacionSemestreId: 2, estado, parametros: { recursos: [recurso] }, revisionEntrada: 'revision-ejecutada', versionModelo: 'v1', resultado: null, diagnostico: null });
const memoria = () => { const mapa = new Map(); return { getItem: k => mapa.get(k) ?? null, setItem: (k, v) => mapa.set(k, v) }; };
function nodos(arbol) {
  return React.isValidElement(arbol) ? [arbol, ...React.Children.toArray(arbol.props.children).flatMap(nodos)] : [];
}
function texto(arbol) {
  return React.isValidElement(arbol) ? React.Children.toArray(arbol.props.children).map(texto).join('') : String(arbol ?? '');
}
function textoVisible(arbol) {
  if (!React.isValidElement(arbol)) return String(arbol ?? '');
  if (arbol.type === 'details' && !arbol.props.open) return '';
  return React.Children.toArray(arbol.props.children).map(textoVisible).join('');
}

// Ejecuta los manejadores y efectos reales con transporte simulado, no acredita un navegador.
async function montar(archivo, nombre, extras, propiedades = {}) {
  let indice = 0, sucio = true, arbol, vivo = true;
  const celdas = [], efectos = [];
  const hooks = {
    useState(inicial) { const i = indice++; celdas[i] ??= { valor: typeof inicial === 'function' ? inicial() : inicial }; return [celdas[i].valor, valor => {
      const nuevo = typeof valor === 'function' ? valor(celdas[i].valor) : valor;
      if (!Object.is(nuevo, celdas[i].valor)) { celdas[i].valor = nuevo; sucio = true; }
    }]; },
    useRef(inicial) { return celdas[indice++] ??= { current: inicial }; },
    useEffect(accion, deps) { const i = indice++; const previa = celdas[i]; if (!previa || deps.some((d, n) => !Object.is(d, previa.deps[n]))) {
      celdas[i] = { deps }; efectos.push(() => { previa?.limpiar?.(); celdas[i].limpiar = accion(); });
    } },
    useMemo(accion, deps) { const i = indice++; if (!celdas[i] || deps.some((d, n) => !Object.is(d, celdas[i].deps[n]))) celdas[i] = { deps, valor: accion() }; return celdas[i].valor; },
    useSyncExternalStore(suscribir, instantanea) { const i = indice++; if (!celdas[i]) celdas[i] = { limpiar: suscribir(() => { sucio = true; }) }; return instantanea(); },
  };
  const entorno = { React, ...hooks, ...modelo, estadoSecciones, planificacionInicial, estilos: {}, Link: 'a', Navigate: 'redirect', Outlet: 'outlet',
    DisponibilidadOptimizacion: () => null, DiagnosticoOptimizacion: () => null, ...extras };
  const fuente = (await readFile(new URL(archivo, import.meta.url), 'utf8')).replace(/^import .*;\r?\n/gm, '').replace(/^export default /gm, '').replace(/^export /gm, '');
  for (const declaracion of fuente.matchAll(/^(?:async )?function (\w+)/gm)) delete entorno[declaracion[1]];
  delete entorno[nombre];
  const codigo = ts.transpileModule(`export function crear(entorno) { const { ${Object.keys(entorno).join(',')} } = entorno; ${fuente}\nreturn ${nombre}; }`, {
    compilerOptions: { jsx: ts.JsxEmit.React, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const componente = (await import(`data:text/javascript;base64,${Buffer.from(codigo).toString('base64')}`)).crear(entorno);
  function dibujar() { indice = 0; sucio = false; arbol = componente(propiedades); efectos.splice(0).forEach(e => e()); }
  async function asentar() { for (let i = 0; i < 20; i++) { if (sucio && vivo) dibujar(); await turno(); if (!sucio) break; } }
  await asentar();
  return { asentar, dibujar, arbol: () => arbol, nodos: () => nodos(arbol), texto: () => texto(arbol),
    boton: nombre => nodos(arbol).find(n => n.type === 'button' && texto(n).includes(nombre)),
    salir: () => { vivo = false; celdas.forEach(c => c?.limpiar?.()); } };
}
async function pagina(opciones = {}) {
  let datos = preparar(), posts = 0;
  const servicio = { ultima: async () => null, consultar: async () => ejecutar('en_ejecucion'), iniciar: async () => { posts++; return ejecutar('en_ejecucion'); }, ...opciones };
  const seguimiento = crearSeguimiento(servicio, memoria(), 'cuenta');
  let vista;
  seguimiento.suscribir(() => vista?.dibujar());
  vista = await montar('./OptimizacionPage.tsx', 'PreparacionModelo', {
    useOptimizacion: () => ({ seguimiento, filas: seguimiento.estado() }), optimizacionApi: { preparar: async () => datos },
  }, { id: 2 });
  return { vista, seguimiento, servicio, posts: () => posts, preparacion: valor => { datos = valor; } };
}

test('preparación muestra revisión, sugerencias y confirma parámetros antes del POST', async () => {
  const { vista, posts } = await pagina();
  assert.match(vista.texto(), /no garantiza|sin garantía/i);
  assert.equal(vista.boton('Iniciar ejecución').props.disabled, true);
  const cantidad = vista.nodos().find(n => n.type === 'input' && n.props.type === 'number');
  assert.equal(cantidad.props.value, '2'); assert.equal(cantidad.props.max, 4);
  vista.nodos().find(n => n.type === 'form').props.onSubmit({ preventDefault() {} }); await vista.asentar(); assert.equal(posts(), 0);
  vista.nodos().find(n => n.type === 'input' && n.props.type === 'checkbox').props.onChange({ target: { checked: true } }); await vista.asentar();
  assert.equal(vista.boton('Iniciar ejecución').props.disabled, false);
  const formulario = vista.nodos().find(n => n.type === 'form');
  formulario.props.onSubmit({ preventDefault() {} }); formulario.props.onSubmit({ preventDefault() {} }); await vista.asentar();
  assert.equal(posts(), 1); assert.match(vista.texto(), /En ejecución/); vista.salir();
});

test('reenvía la solicitud persistida tras recarga aunque falle la preparación', async () => {
  const almacen = memoria(); let solicitudOriginal; const enviadas = [];
  const anterior = crearSeguimiento({ iniciar: async (_id, datos) => { solicitudOriginal = datos; throw new Error('Respuesta perdida'); } }, almacen, 'cuenta');
  await assert.rejects(anterior.iniciar(2, [recurso]));
  const seguimiento = crearSeguimiento({ ultima: async () => null, iniciar: async (_id, datos) => { enviadas.push(datos); return ejecutar('en_ejecucion'); } }, almacen, 'cuenta');
  let vista; const cancelar = seguimiento.suscribir(() => vista?.dibujar());
  vista = await montar('./OptimizacionPage.tsx', 'PreparacionModelo', {
    useOptimizacion: () => ({ seguimiento, filas: seguimiento.estado() }),
    optimizacionApi: { preparar: async () => { throw new Error('Preparación no disponible'); } },
  }, { id: 2 });
  try {
    assert.match(vista.texto(), /Preparación no disponible/);
    assert.equal(enviadas.length, 0);
    assert.equal(vista.boton('Reenviar la misma solicitud').props.disabled, false);
    vista.boton('Reenviar la misma solicitud').props.onClick(); await vista.asentar();
    assert.equal(enviadas.length, 1);
    assert.deepEqual(enviadas[0], solicitudOriginal);
    assert.equal(seguimiento.estado()[2].ejecucion.estado, 'en_ejecucion');
  } finally { cancelar(); vista.salir(); }
});

test('bloqueos del backend y cantidad inválida de laboratorio impiden iniciar sin cambiar contratos', async () => {
  const p = await pagina();
  p.preparacion({ ...preparar(), puedeEjecutar: false, bloqueos: ['Ya existen horarios gestionados.'] });
  p.vista.boton('Actualizar preparación').props.onClick(); await p.vista.asentar();
  assert.match(p.vista.texto(), /Ya existen horarios gestionados/);
  assert.equal(p.vista.nodos().find(n => n.type === 'fieldset').props.disabled, true);
  p.vista.nodos().find(n => n.type === 'form').props.onSubmit({ preventDefault() {} }); await p.vista.asentar(); assert.equal(p.posts(), 0); p.vista.salir();
  const l = await pagina(); l.preparacion({ ...preparar(), laboratorios: { requiereDeclaracion: true, mensaje: 'Declare el total departamental.' } });
  l.vista.boton('Actualizar preparación').props.onClick(); await l.vista.asentar();
  l.vista.nodos().find(n => n.type === 'input' && n.props['aria-label'] === 'Cantidad de laboratorios').props.onChange({ target: { value: '' } }); await l.vista.asentar();
  l.vista.nodos().find(n => n.type === 'input' && n.props.type === 'checkbox').props.onChange({ target: { checked: true } }); await l.vista.asentar();
  l.vista.nodos().find(n => n.type === 'form').props.onSubmit({ preventDefault() {} }); await l.vista.asentar();
  assert.match(l.vista.texto(), /entero/); assert.equal(l.posts(), 0); l.vista.salir();
});

const planificacionesPrueba = [
  { id: 2, carreraId: 1, carrera: { id: 1, nombre: 'Carrera autorizada' }, codigo: '2026-2', actual: true, estadoPlanificacion: 'preparacion' },
  { id: 1, carreraId: 1, carrera: { id: 1, nombre: 'Carrera autorizada' }, codigo: '2025-2', actual: false, estadoPlanificacion: 'publicado' },
];
test('aviso de ejecución aparece bajo el título principal y antes del selector', async () => {
  const vista = await selector('admin', '2');
  const cabecera = vista.nodos().find(n => n.type === 'header');
  const hijos = React.Children.toArray(cabecera.props.children);
  assert.equal(hijos[0].type, 'h1');
  assert.match(texto(hijos[1]), /Solo puedes ejecutar el modelo cuando la planificación está en Preparación/);
  vista.salir();
});
test('preparación omite detalles técnicos y mantiene visibles los motivos que impiden ejecutar', async () => {
  const { vista, preparacion, posts } = await pagina();
  preparacion({ ...preparar(), puedeEjecutar: false, bloqueos: ['Ya existen horarios gestionados.'] });
  vista.boton('Actualizar preparación').props.onClick(); await vista.asentar();
  assert.match(vista.texto(), /Salas para el modelo/);
  assert.doesNotMatch(vista.texto(), /Bloqueos informados por el backend/);
  assert.match(textoVisible(vista.arbol()), /Ya existen horarios gestionados/);
  assert.doesNotMatch(vista.texto(), /Detalles de preparación|revision-consultada|Límite del solver|Procedencia de las categorías/);
  assert.equal(vista.nodos().find(n => n.type === 'fieldset').props.disabled, true);
  assert.equal(posts(), 0); vista.salir();
});
async function selector(rol, valor, planificaciones = planificacionesPrueba) {
  let consulta = new URLSearchParams(valor === undefined ? '' : `planificacion=${valor}`);
  return montar('./OptimizacionPage.tsx', 'OptimizacionPage', {
    useAuth: () => ({ usuario: { id: 9, rol } }),
    useOptimizacion: () => ({ planificaciones, error: '', reintentar() {} }),
    useSearchParams: () => [consulta, nueva => { consulta = new URLSearchParams(nueva); }],
  });
}
test('secretaría solo ofrece el actual autorizado y rechaza consulta histórica, ajena o inválida', async () => {
  for (const valor of ['2', '1', '999', '-2', '2x']) {
    const vista = await selector('secretaria', valor);
    const control = vista.nodos().find(n => n.type === 'select');
    assert.equal(control.props.disabled, true);
    assert.deepEqual(vista.nodos().filter(n => n.type === 'option' && n.props.value !== '').map(n => n.props.value), [2]);
    assert.equal(vista.nodos().some(n => n.type?.name === 'PreparacionModelo'), valor === '2');
    vista.salir();
  }
});
test('secretaría bloquea un catálogo ambiguo entre carreras, sin inventar carrera en la identidad', async () => {
  const vista = await selector('secretaria', '2', [...planificacionesPrueba, { ...planificacionesPrueba[0], id: 3, carreraId: 7, carrera: { id: 7, nombre: 'Otra carrera' } }]);
  assert.equal(vista.nodos().some(n => n.type?.name === 'PreparacionModelo'), false);
  assert.equal(vista.nodos().filter(n => n.type === 'option' && n.props.value !== '').length, 0);
  assert.match(vista.texto(), /No se pudo identificar un único período actual de tu carrera/); vista.salir();
});
test('secretaría inicializa el único actual y bloquea ausencia o duplicidad de períodos actuales', async () => {
  const vista = await selector('secretaria'); vista.dibujar();
  assert.equal(vista.nodos().find(n => n.type?.name === 'PreparacionModelo').props.id, 2);
  vista.nodos().find(n => n.type === 'select').props.onChange({ target: { value: '1' } }); vista.dibujar();
  assert.equal(vista.nodos().find(n => n.type?.name === 'PreparacionModelo').props.id, 2); vista.salir();
  for (const lista of [[], [planificacionesPrueba[1]], [...planificacionesPrueba, { ...planificacionesPrueba[0], id: 4 }]]) {
    const bloqueada = await selector('secretaria', '2', lista);
    assert.equal(bloqueada.nodos().some(n => n.type?.name === 'PreparacionModelo'), false); bloqueada.salir();
  }
});
test('administración conserva selección de históricos y cambio de período', async () => {
  const vista = await selector('admin', '1');
  assert.equal(vista.nodos().find(n => n.type === 'select').props.disabled, false);
  assert.equal(vista.nodos().find(n => n.type?.name === 'PreparacionModelo').props.id, 1);
  vista.nodos().find(n => n.type === 'select').props.onChange({ target: { value: '2' } }); vista.dibujar();
  assert.equal(vista.nodos().find(n => n.type?.name === 'PreparacionModelo').props.id, 2); vista.salir();
});
test('laboratorios presenta solo cantidad, seis iniciales y contrato de capacidad fija al enviar', async () => {
  const solicitudes = [];
  const { vista } = await pagina({ iniciar: async (_id, solicitud) => { solicitudes.push(solicitud); return ejecutar('en_ejecucion'); } });
  const entradas = vista.nodos().filter(n => n.type === 'input' && n.props.type !== 'checkbox');
  assert.equal(entradas.length, 2);
  const cantidad = entradas.find(n => n.props['aria-label'] === 'Cantidad de laboratorios');
  assert.equal(cantidad.props.value, '6'); assert.equal(cantidad.props.min, 0); assert.equal(cantidad.props.max, 10000);
  assert.equal(vista.boton('Agregar categoría'), undefined);
  assert.match(vista.texto(), /Capacidad del modelo: 60 estudiantes/);
  cantidad.props.onChange({ target: { value: '0' } }); await vista.asentar();
  vista.nodos().find(n => n.type === 'input' && n.props.type === 'checkbox').props.onChange({ target: { checked: true } }); await vista.asentar();
  vista.nodos().find(n => n.type === 'form').props.onSubmit({ preventDefault() {} }); await vista.asentar();
  assert.equal(solicitudes.length, 1);
  const laboratorio = solicitudes[0].recursos.find(r => r.tipo === 'Laboratorio');
  assert.deepEqual(laboratorio, { id: 'laboratorios-modelo', edificio: 'Laboratorios del modelo', tipo: 'Laboratorio', capacidad: 60, cantidad: 0,
    fuente: 'Supuesto del modelo: capacidad fija de 60 estudiantes, cantidad declarada para esta ejecución, no inventario físico.' });
  assert.equal('salaId' in laboratorio, false); vista.salir();
});
test('cantidades rechazadas no envían ni cambian la solicitud persistida o el seguimiento', async () => {
  for (const valor of ['', '-1', '1.5', '10001']) {
    const { vista, seguimiento, posts } = await pagina();
    const anterior = JSON.stringify(seguimiento.estado());
    vista.nodos().find(n => n.type === 'input' && n.props['aria-label'] === 'Cantidad de laboratorios').props.onChange({ target: { value: valor } }); await vista.asentar();
    vista.nodos().find(n => n.type === 'input' && n.props.type === 'checkbox').props.onChange({ target: { checked: true } }); await vista.asentar();
    vista.nodos().find(n => n.type === 'form').props.onSubmit({ preventDefault() {} }); await vista.asentar();
    assert.equal(posts(), 0); assert.equal(JSON.stringify(seguimiento.estado()), anterior); assert.match(vista.texto(), /entero/); vista.salir();
  }
});
test('seguimiento muestra inicio y término sin identificadores ni detalles técnicos', async () => {
  const ejecucion = { ...ejecutar('aplicada'), iniciadaEn: '2026-11-04T23:07:37.721Z', finalizadaEn: '2026-11-04T23:08:00.619Z', resultado: { estado: 'optimo' } };
  const { vista } = await pagina({ ultima: async () => ejecucion });
  const primerPlano = textoVisible(vista.arbol());
  assert.match(primerPlano, /Inicio/); assert.match(primerPlano, /Término/);
  assert.ok(primerPlano.includes(modelo.fechaEjecucion(ejecucion.iniciadaEn)));
  assert.ok(primerPlano.includes(modelo.fechaEjecucion(ejecucion.finalizadaEn)));
  assert.doesNotMatch(vista.texto(), /Detalles técnicos|ID de ejecución|revision-ejecutada|Versión del modelo|Estado del solver|Recursos declarados en esta ejecución/);
  assert.ok(!primerPlano.includes('Estado del solver')); assert.match(primerPlano, /La propuesta no está publicada/);
  assert.equal(vista.nodos().filter(n => n.type === 'a' && texto(n) === 'Ver resultado').length, 1); vista.salir();
});
test('confirmación agrupa casilla y texto y limita el tamaño del checkbox frente a estilos globales', async () => {
  const { vista } = await pagina();
  const etiqueta = vista.nodos().find(n => n.type === 'label' && nodos(n).some(hijo => hijo.type === 'input' && hijo.props.type === 'checkbox'));
  assert.equal(etiqueta.props.className, 'confirmacion-optimizacion');
  assert.equal(React.Children.toArray(etiqueta.props.children)[1].type, 'span');
  assert.match(texto(etiqueta), /Confirmo las cantidades para esta ejecución/);
  const css = await readFile(new URL('./optimizacion.css', import.meta.url), 'utf8');
  assert.match(css, /\.pagina-optimizacion \.confirmacion-optimizacion input\[type="checkbox"\]\s*\{[^}]*width:\s*1\.25rem;[^}]*height:\s*1\.25rem;/);
  vista.salir();
});
test('salas muestran categorías separadas y cantidades sin etiquetas visuales repetidas', async () => {
  const { vista, preparacion } = await pagina();
  const categoriasSalas = [{ ...recurso, cantidadCatalogo: 5, cantidadSugerida: 3 }, { ...recurso, id: 'AA-Sala-32', edificio: 'AA', cantidadCatalogo: 3, cantidadSugerida: 2 }];
  preparacion({ ...preparar(), categoriasSalas });
  vista.boton('Actualizar preparación').props.onClick(); await vista.asentar();
  const cantidades = vista.nodos().filter(n => n.type === 'input' && n.props['aria-label']?.startsWith('Cantidad ') && n.props['aria-label'] !== 'Cantidad de laboratorios');
  assert.deepEqual(cantidades.map(n => [n.props.value, n.props.max]), [['3', 5], ['2', 3]]);
  assert.equal(vista.nodos().filter(n => n.type === 'label' && texto(n).includes('capacidad 32')).length, 0);
  const tabla = vista.nodos().find(n => n.type === 'table');
  assert.match(texto(tabla), /AC/); assert.match(texto(tabla), /AA/); assert.match(texto(tabla), /Total en catálogo/); vista.salir();
});
test('salas rechaza cantidades fuera del catálogo sin POST ni cambios de seguimiento', async () => {
  for (const valor of ['', '-1', '1.5', '5', '10001']) {
    const { vista, seguimiento, posts } = await pagina(); const anterior = JSON.stringify(seguimiento.estado());
    vista.nodos().find(n => n.type === 'input' && n.props.type === 'number').props.onChange({ target: { value: valor } }); await vista.asentar();
    vista.nodos().find(n => n.type === 'input' && n.props.type === 'checkbox').props.onChange({ target: { checked: true } }); await vista.asentar();
    vista.nodos().find(n => n.type === 'form').props.onSubmit({ preventDefault() {} }); await vista.asentar();
    assert.equal(posts(), 0); assert.equal(JSON.stringify(seguimiento.estado()), anterior);
    assert.match(vista.texto(), /Cantidad de salas: ingresa un entero entre 0 y 10000\.|La cantidad no puede superar el catálogo de la categoría\./); vista.salir();
  }
  const { vista, preparacion } = await pagina();
  preparacion({ ...preparar(), categoriasSalas: [{ ...recurso, cantidadCatalogo: 20001, cantidadSugerida: 10000 }] });
  vista.boton('Actualizar preparación').props.onClick(); await vista.asentar();
  assert.equal(vista.nodos().find(n => n.type === 'input' && n.props.type === 'number').props.max, 10000); vista.salir();
});
test('disponibilidad usa tabla accesible compacta, sin inventar nombres y en orden ascendente', async () => {
  const vista = await montar('./DiagnosticoOptimizacion.tsx', 'DisponibilidadOptimizacion', {}, { filas: [{ profesorId: 7, bloquesDisponibles: 20 }, { profesorId: 8, bloquesDisponibles: 4 }] });
  const html = renderToStaticMarkup(vista.arbol());
  assert.match(html, /<caption>/); assert.match(html, /scope="col"/); assert.match(html, /scope="row"/);
  assert.ok(html.indexOf('Docente 8') < html.indexOf('Docente 7')); assert.match(html, /después de reservas/); vista.salir();
});
test('diagnóstico aplicado omite solo la frase duplicada y mantiene errores y faltantes visibles', async () => {
  const datos = { codigo: 'aplicada', mensaje: 'Solución completa, válida y vigente incorporada como Propuesta. No está publicada.', errores: ['Error verificable'],
    faltantes: [{ ofertaId: 1, asignaturaCodigo: 'INF', seccion: 1, tipoHoraId: 1, horas: 2 }], certificadoPrioridad: { prioridadCertificada: false } };
  const vista = await montar('./DiagnosticoOptimizacion.tsx', 'DiagnosticoOptimizacion', {}, { datos, resumirAplicada: true });
  assert.ok(!vista.texto().includes(datos.mensaje)); assert.match(vista.texto(), /Error verificable/); assert.match(vista.texto(), /INF/);
  assert.ok(vista.nodos().some(n => n.type === 'details' && texto(n).includes('cota'))); vista.salir();
});
test('diagnósticos no aplicados y mensajes nuevos permanecen visibles, sin ocultar bloqueantes', async () => {
  for (const codigo of ['carga_incompleta', 'infactible', 'limite_tiempo', 'error', 'interrumpida', 'datos_desactualizados', 'aplicada']) {
    const mensaje = `Diagnóstico real: ${codigo}`;
    const vista = await montar('./DiagnosticoOptimizacion.tsx', 'DiagnosticoOptimizacion', {}, { datos: { codigo, mensaje, errores: ['Revisar las entradas'] }, resumirAplicada: codigo === 'aplicada' });
    assert.match(textoVisible(vista.arbol()), new RegExp(mensaje)); assert.match(textoVisible(vista.arbol()), /Revisar las entradas/); vista.salir();
  }
});

test('todos los terminales se muestran sin botón aplicar, reemplazar ni grilla', async () => {
  for (const estado of Object.keys(modelo.etiquetasEstado).filter(e => e !== 'en_ejecucion')) {
    const { vista } = await pagina({ ultima: async () => ejecutar(estado) });
    assert.ok(vista.texto().includes(modelo.etiquetasEstado[estado]));
    assert.equal(vista.nodos().some(n => n.type === 'button' && /aplicar|reemplazar/i.test(texto(n))), false);
    assert.equal(vista.nodos().some(n => n.props.role === 'grid'), false);
    if (estado === 'aplicada') assert.ok(vista.nodos().some(n => n.type === 'a' && n.props.to === modelo.rutaResultados(2)));
    vista.salir();
  }
});

test('diagnóstico renderiza faltantes por asignatura/sección/componente y disponibilidad ascendente', async () => {
  const vista = await montar('./DiagnosticoOptimizacion.tsx', 'DiagnosticoOptimizacion', {}, { datos: {
    faltantes: [{ ofertaId: 3, asignaturaCodigo: 'INF1', seccion: 2, tipoHoraId: 1, componente: 'T', horas: 4 }],
    disponibilidadDocente: [{ profesorId: 7, bloquesDisponibles: 20 }, { profesorId: 8, bloquesDisponibles: 4 }],
  } });
  const html = renderToStaticMarkup(vista.arbol());
  assert.match(html, /INF1/); assert.match(html, /<td>2<\/td><td>T<\/td><td>4<\/td>/);
  assert.ok(html.indexOf('Docente 8') < html.indexOf('Docente 7')); assert.match(html, /no identifica responsables/);
  vista.salir();
});

test('guardia protege acceso directo para cada rol', async () => {
  for (const rol of ['admin', 'secretaria', 'profesor', undefined]) {
    const vista = await montar('./OptimizacionPage.tsx', 'RequireOptimizacion', { useAuth: () => ({ usuario: { rol } }) });
    assert.equal(vista.arbol().type, modelo.puedeOptimizar(rol) ? 'outlet' : 'redirect'); vista.salir();
  }
});

test('layout notifica con acceso al resultado si se navega y solo redirige si sigue en modelo', async () => {
  for (const ruta of ['/app/optimizacion', '/app/asignaturas']) {
    const ubicacion = { pathname: '/app/optimizacion', search: '?planificacion=2' };
    const navegaciones = [], avisos = [];
    const seguimiento = crearSeguimiento({ ultima: async () => ejecutar('en_ejecucion'), consultar: async () => ejecutar('aplicada') }, memoria(), 'cuenta');
    const vista = await montar('./SeguimientoOptimizacion.tsx', 'SeguimientoCuenta', {
      useAuth: () => ({ usuario: { id: 1, rol: 'secretaria' } }), useLocation: () => ubicacion,
      useNavigate: () => (ruta => navegaciones.push(ruta)), createContext: () => ({ Provider: 'provider' }),
      crearSeguimiento: () => seguimiento, optimizacionApi: {}, resultadosHorariosApi: { planificaciones: async () => [] },
      notificaciones: { exito: mensaje => avisos.push(mensaje), advertencia: mensaje => avisos.push(mensaje) },
    }, { children: null });
    await seguimiento.actualizar(2); await vista.asentar(); ubicacion.pathname = ruta; vista.dibujar();
    await seguimiento.actualizar(2); await vista.asentar();
    assert.equal(navegaciones.length, ruta === '/app/optimizacion' ? 1 : 0);
    assert.equal(avisos.length, 1);
    if (ruta !== '/app/optimizacion') assert.ok(vista.nodos().some(n => n.type === 'a' && n.props.to === modelo.rutaResultados(2)));
    vista.salir();
  }
});
