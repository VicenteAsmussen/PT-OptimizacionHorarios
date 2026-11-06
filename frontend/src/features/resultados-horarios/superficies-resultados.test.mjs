import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { registerHooks } from 'node:module';
import * as React from 'react';
import ts from 'typescript';

registerHooks({ resolve(nombre, contexto, siguiente) {
  if (contexto.parentURL?.includes('/frontend/src/') && nombre.startsWith('.') && !/\.[a-z]+$/i.test(nombre)) {
    return siguiente(`${nombre}.ts`, contexto);
  }
  return siguiente(nombre, contexto);
} });

const sesion = { idsHorarios: [11, 12], bloquesIds: [90, 87], ofertaId: 5,
  asignatura: { codigo: '100', nombre: 'Estructuras de Datos', semestreMalla: 3 }, seccion: 1,
  profesor: { id: 8, nombre: 'Docente' }, profesorId: 8, tipoHora: { id: 1, tipo: 'Teórica' },
  dia: 'Lunes', horaInicio: '08:10', horaTermino: '09:30', salas: [null, null], estadoSala: 'pendiente', editable: true };
const resultado = { planificacion: { id: 2, codigo: '2026-2', carreraId: 1, actual: true, estadoPlanificacion: 'propuesta' },
  revision: 'a'.repeat(64), bloques: [], sesiones: [sesion], pendientesSala: 1, disponibilidades: [] };

// Ejecuta los hooks y eventos públicos siguiendo el arnés existente, sin DOM ni red.
async function montar(nombre, propiedades, api = {}, referencia = null) {
  const modelo = await import('./modelo.ts');
  const fuente = (await readFile(new URL(`./${nombre}.tsx`, import.meta.url), 'utf8'))
    .replace(/^import .*;\r?\n/gm, '').replace(/^export default function /gm, 'function ');
  const valores = [], efectos = [], pendientes = [];
  let indice = 0, arbol;
  const entorno = { React, Children: React.Children, isValidElement: React.isValidElement, ...modelo,
    estilos: new Proxy({}, { get: (_, clave) => clave }), resultadosHorariosApi: api, Dialogo: () => null, IconoArchivo: () => null,
    useState(inicial) {
      const posicion = indice++;
      if (!(posicion in valores)) valores[posicion] = inicial;
      return [valores[posicion], nuevo => { valores[posicion] = nuevo; }];
    },
    useRef() { indice++; return { current: referencia }; },
    useEffect(efecto, dependencias) {
      const posicion = indice++;
      const anterior = efectos[posicion];
      if (!anterior || dependencias.some((valor, i) => !Object.is(valor, anterior.dependencias[i]))) {
        pendientes.push(() => { anterior?.limpiar?.(); efectos[posicion] = { dependencias, limpiar: efecto() }; });
      }
    },
  };
  delete entorno[nombre];
  const codigo = ts.transpileModule(`export function crear(entorno) { const { ${Object.keys(entorno).join(', ')} } = entorno;
    ${fuente}\n return ${nombre}; }`, {
    compilerOptions: { jsx: ts.JsxEmit.React, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const { crear } = await import(`data:text/javascript;base64,${Buffer.from(codigo).toString('base64')}`);
  const componente = crear(entorno);
  function renderizar() { indice = 0; arbol = componente(propiedades); pendientes.splice(0).forEach(efecto => efecto()); }
  function buscar(tipo, elemento = arbol) {
    if (!React.isValidElement(elemento)) return [];
    return [...(elemento.type === tipo ? [elemento] : []),
      ...React.Children.toArray(elemento.props.children).flatMap(hijo => buscar(tipo, hijo))];
  }
  function texto(elemento) {
    if (typeof elemento === 'string' || typeof elemento === 'number') return String(elemento);
    return React.isValidElement(elemento) ? React.Children.toArray(elemento.props.children).map(texto).join('') : '';
  }
  renderizar();
  return { buscar, texto, renderizar, boton: nombreBoton => buscar('button').find(boton => texto(boton) === nombreBoton),
    async asentar() { for (let i = 0; i < 5; i++) await Promise.resolve(); renderizar(); },
    cerrar() { efectos.forEach(efecto => efecto.limpiar?.()); } };
}

test('el diálogo separa encabezado, región desplazable y acciones sin cambiar los hijos', async () => {
  const documento = globalThis.document;
  const elementoHtml = globalThis.HTMLElement;
  globalThis.HTMLElement = class {};
  globalThis.document = { activeElement: null, getElementById() {} };
  const propiedades = { titulo: 'Publicar horario', ocupado: false, cerrar() {}, children: [
    React.createElement('p', { key: 'contenido' }, 'Revisión de la planificación'),
    React.createElement('button', { key: 'confirmar', type: 'button' }, 'Confirmar publicación'),
  ] };
  const pagina = await montar('Dialogo', propiedades);
  try {
    const encabezado = pagina.buscar('header')[0];
    assert.ok(encabezado, 'El título necesita un encabezado fuera del área desplazable.');
    const titulo = pagina.buscar('h2', encabezado)[0];
    assert.equal(pagina.texto(titulo), propiedades.titulo);
    const cuerpo = pagina.buscar('div').find(elemento => elemento.props.role === 'region');
    assert.ok(cuerpo, 'El cuerpo debe poder recorrerse y desplazarse con teclado.');
    assert.equal(cuerpo.props.tabIndex, 0);
    assert.equal(cuerpo.props['aria-labelledby'], titulo.props.id);
    assert.equal(pagina.texto(cuerpo), 'Revisión de la planificación');
    assert.equal(pagina.buscar('button', cuerpo).length, 0);
    const pie = pagina.buscar('footer')[0];
    assert.deepEqual(pagina.buscar('button', pie).map(pagina.texto), ['Confirmar publicación', 'Cerrar']);
    assert.equal(pagina.buscar('dialog')[0].props['aria-labelledby'], titulo.props.id);
  } finally { pagina.cerrar(); globalThis.document = documento; globalThis.HTMLElement = elementoHtml; }
});

test('el archivo asocia ayuda y error con su etiqueta sin alterar el rechazo ni la importación', async () => {
  const importados = [];
  const original = JSON.stringify(resultado);
  const pagina = await montar('GestionSalas', { resultado, ocupado: false, exportar() {}, seleccionar() {}, verPendientes() {},
    importar: archivo => importados.push(archivo) });
  try {
    const entrada = () => pagina.buscar('input')[0];
    for (const archivo of [new File(['x'], 'salas.csv'), new File([], 'salas.xlsx'), { name: 'salas.xlsx', size: 10485761 }]) {
      entrada().props.onChange({ target: { files: [archivo] } }); pagina.renderizar();
      const error = pagina.buscar('p').find(parrafo => parrafo.props.role === 'alert');
      assert.equal(pagina.texto(error), 'Selecciona un archivo .xlsx no vacío de hasta 10 MB.');
      assert.equal(entrada().props['aria-invalid'], true);
      assert.ok(entrada().props['aria-describedby'].split(' ').includes(error.props.id));
      pagina.buscar('form')[0].props.onSubmit({ preventDefault() {} });
      assert.equal(pagina.boton('Importar respuesta').props.disabled, true);
      assert.deepEqual(importados, []);
      assert.equal(JSON.stringify(resultado), original);
    }
    const archivo = new File(['xlsx'], 'salas.xlsx');
    entrada().props.onChange({ target: { files: [archivo] } }); pagina.renderizar();
    assert.equal(entrada().props['aria-invalid'], undefined);
    assert.equal(pagina.buscar('p').some(parrafo => parrafo.props.role === 'alert'), false);
    assert.equal(pagina.boton('Importar respuesta').props.disabled, false);
    pagina.buscar('form')[0].props.onSubmit({ preventDefault() {} });
    assert.deepEqual(importados, [archivo]);
    assert.equal(JSON.stringify(resultado), original);
  } finally { pagina.cerrar(); }
});

test('salas conserva orden de acciones, pendientes, exportación y solo lectura', async () => {
  const solicitudes = [], consultas = [], seleccionadas = [];
  const propiedades = { resultado, ocupado: false, exportar: valor => solicitudes.push(valor), importar() {},
    seleccionar: valor => seleccionadas.push(valor), verPendientes: () => consultas.push(true) };
  const pagina = await montar('GestionSalas', propiedades);
  try {
    assert.deepEqual(pagina.buscar('button').slice(0, 4).map(pagina.texto),
      ['Exportar solicitud', 'Exportar pendiente', 'Ver sesiones sin sala', 'Importar respuesta']);
    assert.equal(pagina.boton('Exportar solicitud').props.disabled, false);
    assert.equal(pagina.boton('Exportar pendiente').props.disabled, true);
    pagina.boton('Exportar solicitud').props.onClick(); pagina.boton('Exportar pendiente').props.onClick();
    pagina.boton('Ver sesiones sin sala').props.onClick();
    pagina.buscar('details').flatMap(detalle => pagina.buscar('button', detalle))[0].props.onClick();
    assert.deepEqual(solicitudes, [false]); assert.deepEqual(consultas, [true]); assert.deepEqual(seleccionadas, [sesion]);
    propiedades.ocupado = true; pagina.renderizar();
    assert.ok(pagina.buscar('button').every(boton => boton.props.disabled));
    assert.equal(pagina.buscar('input')[0].props.disabled, true);
    propiedades.ocupado = false;
    propiedades.resultado = { ...resultado, sesiones: [], pendientesSala: 0,
      planificacion: { ...resultado.planificacion, estadoPlanificacion: 'publicado' } }; pagina.renderizar();
    assert.equal(pagina.buscar('form').length, 0);
    assert.ok(pagina.buscar('p').some(parrafo => pagina.texto(parrafo) === 'Solo lectura: no se pueden importar respuestas en este período.'));
    assert.ok(pagina.buscar('p').some(parrafo => pagina.texto(parrafo) === 'No hay sesiones pendientes de sala.'));
    assert.equal(pagina.boton('Ver sesiones sin sala').props.disabled, true);
  } finally { pagina.cerrar(); }
});

test('la publicación conserva espera, revisión exacta, errores, bloqueo y aborto', async () => {
  for (const caso of ['válida', 'obsoleta', 'error', 'solo lectura']) {
    let resolver, rechazar, señal;
    const confirmadas = [];
    const propiedades = { resultado: caso === 'solo lectura' ? { ...resultado,
      planificacion: { ...resultado.planificacion, estadoPlanificacion: 'publicado' } } : resultado,
      ocupado: false, cerrar() {}, confirmar: revision => confirmadas.push(revision) };
    const pagina = await montar('PublicacionDialogo', propiedades, { validarPublicacion(id, signal) {
      assert.equal(id, 2); señal = signal;
      return new Promise((si, no) => { resolver = si; rechazar = no; });
    } });
    try {
      assert.equal(pagina.boton('Confirmar publicación').props.disabled, true);
      assert.equal(pagina.texto(pagina.buscar('p')[0]), 'Validando publicación…');
      if (caso === 'error') rechazar(new Error('No se pudo verificar.'));
      else resolver({ valido: true, revision: caso === 'obsoleta' ? 'b'.repeat(64) : resultado.revision, problemas: [] });
      await pagina.asentar();
      assert.equal(pagina.boton('Confirmar publicación').props.disabled, caso !== 'válida');
      if (caso === 'error') assert.equal(pagina.texto(pagina.buscar('p').find(parrafo => parrafo.props.role === 'alert')), 'No se pudo verificar.');
      if (caso === 'obsoleta') assert.ok(pagina.buscar('p').some(parrafo => pagina.texto(parrafo) === 'El horario cambió. Cierra y actualiza antes de publicar.'));
      if (caso !== 'error') pagina.boton('Confirmar publicación').props.onClick();
      assert.deepEqual(confirmadas, caso === 'válida' ? [resultado.revision] : []);
      propiedades.ocupado = true; pagina.renderizar();
      assert.equal(pagina.boton('Publicando…').props.disabled, true);
    } finally { pagina.cerrar(); }
    assert.equal(señal.aborted, true);
  }
});

test('Escape, cierre ocupado y restauración del foco conservan el contrato del diálogo', async () => {
  const documento = globalThis.document;
  const elementoHtml = globalThis.HTMLElement;
  const llamadas = [];
  class Elemento {
    isConnected = true;
    hasAttribute() { return false; }
    focus() { llamadas.push('foco anterior'); }
  }
  globalThis.HTMLElement = Elemento;
  const anterior = new Elemento();
  globalThis.document = { activeElement: anterior, getElementById(id) {
    assert.equal(id, 'titulo-resultados'); return { focus() { llamadas.push('foco título'); } };
  } };
  const propiedades = { titulo: 'Asignaturas sin sala', ocupado: false, cerrar() { llamadas.push('cerrar'); },
    children: React.createElement('p', null, 'Queda 1 sesión sin sala en toda la planificación.') };
  let pagina;
  try {
    pagina = await montar('Dialogo', propiedades, {}, { showModal() { llamadas.push('abrir'); }, close() { llamadas.push('cerrar nativo'); } });
    assert.deepEqual(llamadas, ['abrir']);
    pagina.buscar('dialog')[0].props.onCancel({ preventDefault() { llamadas.push('prevenir'); } });
    assert.deepEqual(llamadas, ['abrir', 'prevenir', 'cerrar']);
    propiedades.ocupado = true; pagina.renderizar();
    assert.equal(pagina.boton('Cerrar').props.disabled, true);
    pagina.buscar('dialog')[0].props.onCancel({ preventDefault() { llamadas.push('prevenir'); } });
    assert.deepEqual(llamadas, ['abrir', 'prevenir', 'cerrar', 'prevenir']);
    propiedades.ocupado = false; pagina.renderizar();
    pagina.boton('Cerrar').props.onClick();
    assert.equal(llamadas.at(-1), 'cerrar');
    pagina.cerrar(); pagina = null;
    assert.deepEqual(llamadas.slice(-2), ['cerrar nativo', 'foco anterior']);
    anterior.isConnected = false;
    pagina = await montar('Dialogo', propiedades, {}, { showModal() {}, close() {} });
    pagina.cerrar(); pagina = null;
    assert.equal(llamadas.at(-1), 'foco título');
  } finally { pagina?.cerrar(); globalThis.document = documento; globalThis.HTMLElement = elementoHtml; }
});

test('las superficies limitan el viewport y mantienen el scroll separado del pie', async () => {
  // La presentación pasiva se comprueba estructuralmente, no sustituye una revisión en navegador.
  const css = await readFile(new URL('./SuperficiesResultados.module.css', import.meta.url), 'utf8');
  const dialogo = css.match(/\.dialogo\s*\{([^}]+)\}/)?.[1];
  assert.ok(dialogo);
  assert.doesNotMatch(dialogo, /display\s*:/, 'Un diálogo cerrado debe conservar la ocultación nativa.');
  assert.match(dialogo, /max-height:\s*calc\(100dvh - 2rem\)/);
  assert.match(dialogo, /overflow:\s*hidden/);
  assert.match(css, /\.dialogo\[open\]\s*\{[^}]*display:\s*flex/);
  const cuerpo = css.match(/\.cuerpoDialogo\s*\{([^}]+)\}/)?.[1];
  assert.match(cuerpo, /min-height:\s*0/);
  assert.match(cuerpo, /overflow:\s*auto/);
  assert.match(cuerpo, /overscroll-behavior:\s*contain/);
  assert.match(css, /\.cabeceraDialogo, \.pieDialogo\s*\{[^}]*flex-shrink:\s*0/);
  assert.match(css, /:focus-visible[^}]*outline:\s*3px solid var\(--color-foco\)/);
  assert.match(css, /@media[^}]*max-height:\s*30rem/);
});

test('S14 salas conserva una sección estructurada, botones celestes y separación', async () => {
  const pagina = await montar('GestionSalas', { resultado, ocupado: false, exportar() {}, importar() {}, seleccionar() {}, verPendientes() {} });
  try {
    assert.equal(pagina.buscar('h2').filter(nodo => pagina.texto(nodo) === 'Asignación de salas').length, 1);
    assert.equal(pagina.buscar('header').length, 1);
    assert.equal(pagina.buscar('form').length, 1);
    assert.equal(pagina.buscar('div').filter(nodo => nodo.props.className === 'acciones').length, 1);
    const css = await readFile(new URL('./SuperficiesResultados.module.css', import.meta.url), 'utf8');
    assert.match(css, /\.acciones\s*\{[^}]*display:\s*flex;[^}]*flex-wrap:\s*wrap;[^}]*gap:\s*\.75rem/);
    assert.doesNotMatch(css, /\.gestionSalas\s+\.accion(?:Principal|Secundaria)/,
      'Las acciones de salas deben usar el celeste del botón base, sin el override de los diálogos.');
    const botones = await readFile(new URL('../../styles/botones.css', import.meta.url), 'utf8');
    assert.match(botones, /\.boton\s*\{[^}]*--boton-fondo:\s*var\(--color-azul-fondo\)/);
    assert.match(botones, /\.boton\s*\{[^}]*--boton-hover:\s*var\(--color-azul-hover\)/);
    const fuentePagina = await readFile(new URL('./ResultadosHorariosPage.tsx', import.meta.url), 'utf8');
    assert.equal([...fuentePagina.matchAll(/<GestionSalas\b/g)].length, 1);
  } finally { pagina.cerrar(); }
});

test('S13 el tamaño de detalle es explícito y no cambia el diálogo predeterminado ni sus cierres', async () => {
  const documento = globalThis.document, elementoHtml = globalThis.HTMLElement;
  const llamadas = [];
  globalThis.HTMLElement = class { isConnected = true; hasAttribute() { return false; } focus() { llamadas.push('foco'); } };
  globalThis.document = { activeElement: new globalThis.HTMLElement() };
  try {
    for (const [tamano, titulo] of [[undefined, 'Detalle de la sesión'], ['detalle', 'Título independiente'], [undefined, 'Publicar horario'], [undefined, 'Asignaturas sin sala']]) {
      const pagina = await montar('Dialogo', { tamano, titulo, ocupado: false, cerrar() { llamadas.push('cerrar'); }, children: React.createElement('p', null, 'Contenido') }, {},
        { showModal() { llamadas.push('abrir'); }, close() { llamadas.push('cierre nativo'); } });
      try {
        const dialogo = pagina.buscar('dialog')[0];
        assert.equal(dialogo.props['data-tamano'], tamano);
        assert.equal(dialogo.props.className, 'dialogo');
        dialogo.props.onCancel({ preventDefault() {} });
        assert.equal(llamadas.at(-1), 'cerrar');
      } finally { pagina.cerrar(); }
      assert.deepEqual(llamadas.slice(-2), ['cierre nativo', 'foco']);
    }
    const fuente = await readFile(new URL('./DetalleSesionDialogo.tsx', import.meta.url), 'utf8');
    assert.match(fuente, /<Dialogo[^>]*tamano="detalle"/);
    const css = await readFile(new URL('./SuperficiesResultados.module.css', import.meta.url), 'utf8');
    assert.match(css, /\.dialogo\s*\{[^}]*width:\s*min\(76rem, calc\(100% - 2rem\)\)/);
    assert.match(css, /\.dialogo\[data-tamano="detalle"\]\s*\{[^}]*width:\s*min\(34rem, calc\(100% - 2rem\)\)/);
    assert.match(css, /\.dialogo:has\(\[data-dialogo-publicacion\]\)[^}]*min\(36rem/);
  } finally { globalThis.document = documento; globalThis.HTMLElement = elementoHtml; }
});
