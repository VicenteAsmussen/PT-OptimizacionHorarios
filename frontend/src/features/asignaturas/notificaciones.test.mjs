import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as React from 'react';
import ts from 'typescript';
import * as datos from './datos.ts';
import * as periodos from '../../lib/periodos.ts';

// Ejecuta componentes, efectos y handlers reales sin red ni navegador.
async function montar(ruta, api, propiedades) {
  const celdas = [];
  const efectos = [];
  const activos = new Map();
  const avisos = [];
  let cursor = 0;
  let identificador = 0;
  const iguales = (a, b) => a && b && a.length === b.length && a.every((valor, i) => Object.is(valor, b[i]));
  const react = { ...React,
    useState(inicial) {
      const indice = cursor++;
      celdas[indice] ??= { valor: typeof inicial === 'function' ? inicial() : inicial };
      return [celdas[indice].valor, valor => { celdas[indice].valor = typeof valor === 'function' ? valor(celdas[indice].valor) : valor; }];
    },
    useRef(inicial) { const indice = cursor++; return celdas[indice] ??= { current: inicial }; },
    useEffect(efecto, dependencias) {
      const indice = cursor++;
      if (!iguales(celdas[indice]?.dependencias, dependencias)) {
        efectos.push(() => { celdas[indice]?.limpiar?.(); celdas[indice] = { dependencias, limpiar: efecto() }; });
      }
    },
    useCallback(funcion, dependencias) {
      const indice = cursor++;
      if (!iguales(celdas[indice]?.dependencias, dependencias)) celdas[indice] = { dependencias, funcion };
      return celdas[indice].funcion;
    },
  };
  const notificaciones = Object.fromEntries(['exito', 'error'].map(tipo => [tipo, mensaje => {
    const id = ++identificador;
    avisos.push([tipo, mensaje]); activos.set(id, [tipo, mensaje]); return id;
  }]));
  notificaciones.cerrar = id => activos.delete(id);
  const modulos = {
    react, './datos': datos, './asignaturas.api': { asignaturasApi: api },
    '../../lib/periodos': periodos,
    '../../lib/notificaciones': { notificaciones },
    './PanelAsignatura': { __esModule: true, default: ({ children }) => children },
    './SelectorProfesor': { __esModule: true, default: () => null },
    '../../hooks/useAuth': { useAuth: () => ({ usuario: { rol: 'secretaria' } }) },
    '../optimizacion/SeguimientoOptimizacion': { useBloqueoOptimizacion: () => false, AvisoBloqueo: () => null },
  };
  async function cargar(archivo) {
    const fuente = await readFile(new URL(archivo, import.meta.url), 'utf8');
    const codigo = ts.transpileModule(`import React from 'react';\n${fuente}`, {
      compilerOptions: { jsx: ts.JsxEmit.React, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    }).outputText;
    const exportaciones = {};
    new Function('require', 'exports', codigo)(nombre => {
      if (nombre.endsWith('.css')) return {};
      assert.ok(nombre in modulos, nombre);
      return modulos[nombre];
    }, exportaciones);
    return exportaciones;
  }
  modulos['./useMutacion'] = await cargar('./useMutacion.ts');
  const Componente = (await cargar(ruta)).default;
  function dibujar() {
    cursor = 0;
    let arbol = Componente(propiedades);
    if (ruta === './PanelSecciones.tsx') arbol = arbol.type(arbol.props);
    efectos.splice(0).forEach(efecto => efecto());
    return arbol;
  }
  return { dibujar, activos, avisos, desmontar() { celdas.forEach(celda => celda?.limpiar?.()); } };
}
function elementos(arbol, condicion) {
  if (!arbol || typeof arbol !== 'object') return [];
  if (Array.isArray(arbol)) return arbol.flatMap(hijo => elementos(hijo, condicion));
  return [...(condicion(arbol) ? [arbol] : []), ...elementos(arbol.props?.children, condicion)];
}
function texto(arbol) {
  if (arbol == null || typeof arbol === 'boolean') return '';
  if (Array.isArray(arbol)) return arbol.map(texto).join('');
  return typeof arbol === 'object' ? texto(arbol.props?.children) : String(arbol);
}
const alertas = arbol => elementos(arbol, e => e.props?.role === 'alert').map(texto);
const formulario = montaje => elementos(montaje.dibujar(), e => e.type === 'form')[0];
const boton = (montaje, etiqueta) => elementos(montaje.dibujar(), e => e.type === 'button' && texto(e) === etiqueta)[0];
const esperar = () => new Promise(resolve => setImmediate(resolve));
async function enviar(montaje) { formulario(montaje).props.onSubmit({ preventDefault() {} }); await esperar(); }
function cambiar(montaje, tipo, indice, valor) {
  elementos(montaje.dibujar(), e => e.type === tipo)[indice].props.onChange({ target: { value: valor } });
  formulario(montaje).props.onChange?.();
}
const asignatura = { codigo: 'PRUEBA', nombre: 'Asignatura de prueba', departamentoId: 1, semestreMalla: 2, esCritica: false, tiposHora: [] };
const semestre = { id: 2, actual: true, estadoPlanificacion: 'preparacion', codigo: '2026-2', carrera: { nombre: 'Carrera de prueba' } };
const oferta = { id: 8, asignaturaCodigo: asignatura.codigo, planificacionSemestreId: 2, seccion: 1, cupos: 0, asignaciones: [], horarios: [] };
const propiedadesEdicion = alCompletar => ({ asignatura, departamentos: [{ id: 1, nombre: 'Departamento de prueba' }], alCerrar() {}, alCompletar });
const propiedadesSecciones = alCambiarOfertas => ({ asignatura, semestre, alCerrar() {}, alCambiarOfertas });

test('validaciones de asignatura solo se anuncian junto al formulario y no escriben ni actualizan contadores', async () => {
  for (const [tipo, indice, valor, mensaje] of [
    ['input', 0, '   ', 'Ingresa el nombre de la asignatura.'],
    ['select', 0, '99', 'Selecciona un departamento válido.'],
    ...['0', '15', '1.5'].map(valor => ['input', 1, valor, 'El semestre de malla debe estar entre 1 y 14.']),
  ]) {
    const llamadas = [];
    const montaje = await montar('./EditarAsignatura.tsx', { editar: (...args) => llamadas.push(args) }, propiedadesEdicion(() => llamadas.push('completar')));
    cambiar(montaje, tipo, indice, valor);
    await enviar(montaje);
    assert.deepEqual(alertas(montaje.dibujar()), [mensaje]);
    assert.deepEqual(montaje.avisos, [], 'la validación no crea toast');
    assert.deepEqual(llamadas, [], 'sin escritura ni actualización del padre');
    cambiar(montaje, tipo, indice, tipo === 'select' ? '1' : indice === 0 ? 'Nombre corregido' : '14');
    assert.deepEqual(alertas(montaje.dibujar()), [], 'corregir el formulario retira el aviso obsoleto');
    montaje.desmontar();
  }
});

test('fallos remotos de asignatura solo usan Sonner y el reintento conserva el payload y el bloqueo de doble envío', async () => {
  for (const fallo of [new Error('No se pudo actualizar la asignatura.'), null]) {
    const llamadas = [];
    let rechazar;
    let resolver;
    let completadas = 0;
    const montaje = await montar('./EditarAsignatura.tsx', { editar: (...args) => {
      llamadas.push(args); return new Promise((resolve, reject) => { resolver = resolve; rechazar = reject; });
    } }, propiedadesEdicion(() => completadas++));
    cambiar(montaje, 'input', 0, ' Nombre corregido ');
    formulario(montaje).props.onSubmit({ preventDefault() {} });
    formulario(montaje).props.onSubmit({ preventDefault() {} });
    assert.equal(elementos(montaje.dibujar(), e => e.type === 'fieldset')[0].props.disabled, true);
    assert.equal(llamadas.length, 1);
    rechazar(fallo); await esperar();
    const mensaje = fallo?.message ?? 'No se pudo guardar. Inténtalo nuevamente.';
    assert.deepEqual(alertas(montaje.dibujar()), [], 'el fallo genérico no se duplica inline');
    assert.deepEqual([...montaje.activos.values()], [['error', mensaje]]);
    assert.equal(completadas, 0);
    formulario(montaje).props.onSubmit({ preventDefault() {} });
    assert.equal(montaje.activos.size, 0, 'el nuevo intento retira el fallo anterior');
    resolver(); await esperar();
    assert.deepEqual([...montaje.activos.values()], [['exito', 'Cambios guardados.']]);
    assert.deepEqual(alertas(montaje.dibujar()), []);
    assert.equal(completadas, 1);
    assert.deepEqual(llamadas, Array(2).fill(['PRUEBA', { nombre: 'Nombre corregido', departamentoId: 1, semestreMalla: 2, esCritica: false }]));
    montaje.desmontar();
    assert.deepEqual([...montaje.activos.values()], [['exito', 'Cambios guardados.']], 'el cierre tras guardar no oculta la confirmación');
  }
});

test('la validación de profesores usa prepararOferta sin convertirla en fallo remoto', async () => {
  let escrituras = 0;
  let conteos = 0;
  const montaje = await montar('./PanelSecciones.tsx', {
    ofertas: async () => [], profesores: async () => [], crearOferta: async () => escrituras++,
  }, propiedadesSecciones(() => conteos++));
  montaje.dibujar(); await esperar();
  boton(montaje, 'Agregar sección').props.onClick();
  elementos(montaje.dibujar(), e => typeof e.props?.alCambiar === 'function')[0].props.alCambiar([{ tipoHoraId: 1, profesorId: 99 }]);
  await enviar(montaje);
  assert.deepEqual(alertas(montaje.dibujar()), ['Selecciona un profesor válido para cada tipo de hora asignado.']);
  assert.deepEqual(montaje.avisos, []);
  assert.equal(escrituras, 0); assert.equal(conteos, 0);
  elementos(montaje.dibujar(), e => typeof e.props?.alCambiar === 'function')[0].props.alCambiar([]);
  assert.deepEqual(alertas(montaje.dibujar()), [], 'elegir o limpiar un profesor por botón retira la validación obsoleta');
  montaje.desmontar();
});

test('cancelar o cambiar de acción retira el error remoto sin esperar a cerrar el panel', async () => {
  const montaje = await montar('./PanelSecciones.tsx', {
    ofertas: async () => [oferta], profesores: async () => [],
    crearOferta: async () => { throw new Error('Fallo remoto de esa acción.'); },
  }, propiedadesSecciones(() => {}));
  montaje.dibujar(); await esperar();
  boton(montaje, 'Agregar sección').props.onClick();
  await enviar(montaje);
  assert.equal(montaje.activos.size, 1);
  boton(montaje, 'Cancelar').props.onClick();
  assert.equal(montaje.activos.size, 0);
  boton(montaje, 'Editar').props.onClick();
  assert.equal(montaje.activos.size, 0);
  assert.deepEqual(alertas(montaje.dibujar()), []);
  montaje.desmontar();
});

test('abrir y cancelar otra acción conserva el éxito confirmado y el payload de creación', async () => {
  const llamadas = [];
  const montaje = await montar('./PanelSecciones.tsx', {
    ofertas: async () => [], profesores: async () => [],
    crearOferta: async (...argumentos) => llamadas.push(argumentos),
  }, propiedadesSecciones(() => {}));
  montaje.dibujar(); await esperar();
  boton(montaje, 'Agregar sección').props.onClick();
  await enviar(montaje);
  assert.deepEqual(llamadas, [['PRUEBA', 2, { seccion: 1, cupos: 0, asignaciones: [] }]]);
  boton(montaje, 'Agregar sección').props.onClick();
  boton(montaje, 'Cancelar').props.onClick();
  assert.deepEqual([...montaje.activos.values()], [['exito', 'Cambios guardados.']]);
  montaje.desmontar();
});

test('el callback real del selector retira la validación y envía únicamente la asignación corregida', async () => {
  const llamadas = [];
  const asignaturaConHoras = { ...asignatura, tiposHora: [{ tipoHoraId: 1, horas: 2, tipoHora: { tipo: 'Teoría' } }] };
  const montaje = await montar('./PanelSecciones.tsx', {
    ofertas: async () => [], profesores: async () => [{ id: 7, nombre: 'Docente de prueba', departamento: { id: 1 } }],
    crearOferta: async (...argumentos) => llamadas.push(argumentos),
  }, { ...propiedadesSecciones(() => {}), asignatura: asignaturaConHoras });
  montaje.dibujar(); await esperar();
  boton(montaje, 'Agregar sección').props.onClick();
  elementos(montaje.dibujar(), e => typeof e.props?.alCambiar === 'function')[0].props.alCambiar([{ tipoHoraId: 1, profesorId: 99 }]);
  await enviar(montaje);
  assert.equal(alertas(montaje.dibujar()).length, 1);
  assert.deepEqual(llamadas, []);
  const editor = elementos(montaje.dibujar(), e => typeof e.props?.alCambiar === 'function')[0];
  const selector = elementos(editor.type(editor.props), e => typeof e.props?.alSeleccionar === 'function')[0];
  selector.props.alSeleccionar(7);
  assert.deepEqual(alertas(montaje.dibujar()), []);
  await enviar(montaje);
  assert.deepEqual(llamadas, [['PRUEBA', 2, { seccion: 1, cupos: 0, asignaciones: [{ tipoHoraId: 1, profesorId: 7 }] }]]);
  montaje.desmontar();
});

test('cambiar de contexto retira el fallo anterior y no lo hereda el nuevo panel', async () => {
  const api = { ofertas: async () => [], profesores: async () => [], crearOferta: async () => { throw new Error('Fallo del contexto anterior.'); } };
  const anterior = await montar('./PanelSecciones.tsx', api, propiedadesSecciones(() => assert.fail('sin actualización de conteos')));
  anterior.dibujar(); await esperar();
  boton(anterior, 'Agregar sección').props.onClick();
  await enviar(anterior);
  assert.deepEqual([...anterior.activos.values()], [['error', 'Fallo del contexto anterior.']]);
  anterior.desmontar();
  assert.equal(anterior.activos.size, 0);
  const actual = await montar('./PanelSecciones.tsx', api, { ...propiedadesSecciones(() => {}), semestre: { ...semestre, id: 3 } });
  actual.dibujar(); await esperar();
  assert.deepEqual(alertas(actual.dibujar()), []);
  assert.deepEqual(actual.avisos, []);
  assert.equal(formulario(actual), undefined);
  actual.desmontar();
});

test('prepararOferta conserva sus validaciones locales sin toast ni escritura y no arrastra avisos al cambiar de acción', async () => {
  for (const [tipo, indice, valor, mensaje] of [
    ...['', '0', '6', '1.5', '1'].map(valor => ['select', 0, valor, 'Selecciona una sección disponible entre 1 y 5.']),
    ...['', '-1', '0.5', '9007199254740992'].map(valor => ['input', 0, valor, 'Los cupos deben ser un entero no negativo.']),
  ]) {
    const escrituras = [];
    const montaje = await montar('./PanelSecciones.tsx', {
      ofertas: async () => [oferta], profesores: async () => [], crearOferta: (...args) => escrituras.push(args),
    }, propiedadesSecciones(() => escrituras.push('conteos')));
    montaje.dibujar(); await esperar();
    boton(montaje, 'Agregar sección').props.onClick();
    cambiar(montaje, tipo, indice, valor);
    await enviar(montaje);
    assert.deepEqual(alertas(montaje.dibujar()), [mensaje]);
    assert.deepEqual(montaje.avisos, []);
    assert.deepEqual(escrituras, []);
    boton(montaje, 'Cancelar').props.onClick();
    boton(montaje, 'Eliminar').props.onClick();
    assert.deepEqual(alertas(montaje.dibujar()), [], 'la confirmación no hereda la validación del formulario previo');
    montaje.desmontar();
  }
});

test('crear, editar y eliminar conservan su operación y anuncian solo Sonner, incluso con fallo posterior de recarga', async () => {
  for (const accion of ['crear', 'editar', 'eliminar']) {
    const escrituras = [];
    let conteos = 0;
    let lecturas = 0;
    const api = {
      ofertas: async () => { if (++lecturas === 2) throw new Error('No se pudo actualizar la lista.'); return [oferta]; },
      profesores: async () => [],
      ...Object.fromEntries(['crearOferta', 'editarOferta', 'eliminarOferta'].map(nombre => [nombre, async (...args) => escrituras.push([nombre, ...args])])),
    };
    const montaje = await montar('./PanelSecciones.tsx', api, propiedadesSecciones(() => conteos++));
    montaje.dibujar(); await esperar();
    boton(montaje, accion === 'crear' ? 'Agregar sección' : accion === 'editar' ? 'Editar' : 'Eliminar').props.onClick();
    await enviar(montaje);
    assert.deepEqual(escrituras, [accion === 'crear' ? ['crearOferta', 'PRUEBA', 2, { seccion: 2, cupos: 0, asignaciones: [] }]
      : accion === 'editar' ? ['editarOferta', 8, { seccion: 1, cupos: 0, asignaciones: [] }] : ['eliminarOferta', 8]]);
    assert.equal(conteos, 1);
    assert.deepEqual(montaje.avisos, [['exito', 'Cambios guardados.']]);
    const avisosCarga = alertas(montaje.dibujar());
    assert.equal(avisosCarga.length, 1);
    assert.ok(avisosCarga[0].includes('No se pudo actualizar la lista.'));
    assert.ok(avisosCarga[0].includes('Los cambios ya se guardaron. Reintentar solo actualiza la lista.'));
    boton(montaje, 'Reintentar carga').props.onClick(); await esperar();
    assert.deepEqual(alertas(montaje.dibujar()), []);
    assert.equal(escrituras.length, 1, 'reintentar carga no repite la escritura');
    assert.equal(conteos, 1);
    assert.equal(lecturas, 3);
    montaje.desmontar();
  }
});

test('fallos de las tres operaciones de secciones no se duplican y permiten reintentar', async () => {
  for (const accion of ['crear', 'editar', 'eliminar']) {
    let intentos = 0;
    let conteos = 0;
    let lecturas = 0;
    const guardar = async () => { if (++intentos === 1) throw new Error('Operación rechazada.'); };
    const montaje = await montar('./PanelSecciones.tsx', {
      ofertas: async () => { lecturas++; return [oferta]; }, profesores: async () => [],
      crearOferta: guardar, editarOferta: guardar, eliminarOferta: guardar,
    }, propiedadesSecciones(() => conteos++));
    montaje.dibujar(); await esperar();
    boton(montaje, accion === 'crear' ? 'Agregar sección' : accion === 'editar' ? 'Editar' : 'Eliminar').props.onClick();
    await enviar(montaje);
    assert.deepEqual(alertas(montaje.dibujar()), []);
    assert.deepEqual([...montaje.activos.values()], [['error', 'Operación rechazada.']]);
    assert.equal(conteos, 0); assert.equal(lecturas, 1);
    await enviar(montaje);
    assert.equal(intentos, 2); assert.equal(conteos, 1); assert.equal(lecturas, 2);
    assert.deepEqual([...montaje.activos.values()], [['exito', 'Cambios guardados.']]);
    montaje.desmontar();
  }
});

test('desmontar silencia guardados tardíos y fallos tardíos, sin completar ni actualizar contadores', async () => {
  for (const ruta of ['./EditarAsignatura.tsx', './PanelSecciones.tsx']) for (const falla of [false, true]) {
    let resolver;
    let rechazar;
    let completadas = 0;
    const guardar = () => new Promise((resolve, reject) => { resolver = resolve; rechazar = reject; });
    const montaje = await montar(ruta, { editar: guardar, crearOferta: guardar, ofertas: async () => [], profesores: async () => [] },
      ruta === './EditarAsignatura.tsx' ? propiedadesEdicion(() => completadas++) : propiedadesSecciones(() => completadas++));
    montaje.dibujar(); await esperar();
    if (ruta === './PanelSecciones.tsx') boton(montaje, 'Agregar sección').props.onClick();
    formulario(montaje).props.onSubmit({ preventDefault() {} });
    montaje.desmontar();
    if (falla) rechazar(new Error('Respuesta tardía.')); else resolver();
    await esperar();
    assert.deepEqual(montaje.avisos, []);
    assert.equal(montaje.activos.size, 0);
    assert.equal(completadas, 0);
  }
});
