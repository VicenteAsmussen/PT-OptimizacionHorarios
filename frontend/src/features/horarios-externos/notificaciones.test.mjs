import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';
import { ordenarPeriodosPorFechaAcademica, planificacionInicial } from '../../lib/periodos.ts';
import { departamentosExternos, mensajeErrorCobertura, presentacionCobertura } from './datos.ts';

// Node 22 no transforma propiedades de parámetro, se transpila la API sin generar archivos.
const codigoApi = ts.transpileModule(await readFile(new URL('../../lib/api.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const { ApiError } = await import(`data:text/javascript;base64,${Buffer.from(codigoApi).toString('base64')}`);

const exito = 'Importación completada. Los horarios se guardaron correctamente.';
const cobertura = [{ codigo: 'MAT101', nombre: 'Matemática', semestreMalla: 2, secciones: [1], estado: 'cargada' }];
const resultado = { ofertasCreadas: 1, ofertasActualizadas: 2, ofertasEliminadas: 3, horariosCreados: 4, cobertura };
const estilos = new Proxy({}, { get: (_, nombre) => String(nombre) });

// Ejecuta la página y sus efectos con hooks controlados, sin DOM, red ni archivos reales.
async function preparar({ importar = async () => resultado, consultar = async () => ({ cobertura }), bloqueado = false } = {}) {
  const fuente = await readFile(new URL('./HorariosExternosPage.tsx', import.meta.url), 'utf8');
  const estados = [], referencias = [], efectos = [], pendientes = [], avisos = [], solicitudes = [];
  let indiceEstado, indiceRef, indiceEfecto, cambio = true, arbol, siguienteAviso = 0;
  const dependencias = {
    React, ApiError, ordenarPeriodosPorFechaAcademica, planificacionInicial,
    departamentosExternos, mensajeErrorCobertura, presentacionCobertura, base: estilos, estilos,
    IconoArchivo: () => null, ResumenDepartamentos: () => null, AvisoBloqueo: () => null,
    useBloqueoOptimizacion: () => bloqueado,
    useDesbordamientoTabla: () => ({ referencia() {}, desborda: false }),
    useMemo: calcular => calcular(),
    useState(inicial) {
      const indice = indiceEstado++;
      if (!(indice in estados)) estados[indice] = inicial;
      return [estados[indice], valor => {
        const nuevo = typeof valor === 'function' ? valor(estados[indice]) : valor;
        if (!Object.is(estados[indice], nuevo)) { estados[indice] = nuevo; cambio = true; }
      }];
    },
    useRef(inicial) {
      const indice = indiceRef++;
      return referencias[indice] ??= { current: inicial };
    },
    useEffect(efecto, dependencias) {
      const indice = indiceEfecto++;
      const previo = efectos[indice];
      if (!previo || dependencias.some((valor, posicion) => !Object.is(valor, previo.dependencias[posicion]))) {
        pendientes.push(() => {
          previo?.limpiar?.();
          efectos[indice] = { dependencias, limpiar: efecto() };
        });
      }
    },
    notificaciones: {
      exito(mensaje) { const id = ++siguienteAviso; avisos.push({ tipo: 'exito', mensaje, id }); return id; },
      error(mensaje) { avisos.push({ tipo: 'error', mensaje }); },
      cerrar(id) { avisos.push({ tipo: 'cerrar', id }); },
    },
    horariosExternosApi: {
      planificaciones: async () => [{ id: 7, actual: true, carreraId: 1, codigo: '2026-2', estadoPlanificacion: 'preparacion', carrera: { nombre: 'Carrera simulada' } }],
      departamentos: async () => [2, 3].map(id => ({ id, nombre: `Departamento ${id}`, carreraDepartamentos: [{ carreraId: 1, esGestionado: false }] })),
      cobertura: async (...argumentos) => { solicitudes.push(['consulta', ...argumentos]); return consultar(...argumentos); },
      importar: async (...argumentos) => { solicitudes.push(['importar', ...argumentos]); return importar(...argumentos); },
    },
  };
  const codigo = ts.transpileModule(fuente.slice(fuente.indexOf('function PaginaImportacion()')), {
    compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const Pagina = new Function(...Object.keys(dependencias), `${codigo}; return PaginaImportacion;`)(...Object.values(dependencias));
  async function actualizar() {
    for (let vuelta = 0; vuelta < 10; vuelta++) {
      if (cambio) {
        cambio = false; indiceEstado = 0; indiceRef = 0; indiceEfecto = 0;
        arbol = Pagina();
        while (pendientes.length) pendientes.shift()();
      }
      await new Promise(resolve => setImmediate(resolve));
      if (!cambio) return;
    }
    assert.fail('La página no estabilizó sus efectos.');
  }
  function elementos(tipo, nodo = arbol) {
    if (!React.isValidElement(nodo)) return [];
    return [...(nodo.type === tipo ? [nodo] : []), ...React.Children.toArray(nodo.props.children).flatMap(hijo => elementos(tipo, hijo))];
  }
  async function seleccionar(archivo = { name: 'horarios.xlsx', size: 100 }) {
    elementos('input').find(elemento => elemento.props.type === 'file').props.onChange({ target: { files: archivo ? [archivo] : [], value: 'archivo' } });
    await actualizar();
  }
  async function enviar() {
    elementos('input').find(elemento => elemento.props.type === 'checkbox').props.onChange({ target: { checked: true } });
    await actualizar();
    elementos('form')[0].props.onSubmit({ preventDefault() {} });
    await actualizar();
  }
  async function cambiarDepartamento(id) {
    elementos('select').at(-1).props.onChange({ target: { value: String(id) } });
    await actualizar();
  }
  async function consultarGuardada() {
    elementos('button').find(elemento => elemento.props.children === 'Consultar carga guardada').props.onClick();
    await actualizar();
  }
  await actualizar();
  await cambiarDepartamento(2);
  return { avisos, solicitudes, elementos, actualizar, seleccionar, enviar, cambiarDepartamento, consultarGuardada,
    html: () => renderToStaticMarkup(arbol), desmontar: () => efectos.forEach(efecto => efecto.limpiar?.()) };
}

test('una importación confirmada emite un solo éxito por Sonner y conserva los recuentos y la cobertura', async () => {
  const pagina = await preparar();
  assert.deepEqual(pagina.avisos, [], 'las consultas iniciales no son operaciones');
  await pagina.seleccionar(); await pagina.enviar();
  assert.deepEqual(pagina.avisos, [{ tipo: 'exito', mensaje: exito, id: 1 }]);
  assert.equal(pagina.solicitudes.filter(([tipo]) => tipo === 'importar').length, 1);
  assert.doesNotMatch(pagina.html(), /Importación completada/);
  assert.match(pagina.html(), /1 secciones creadas · 2 actualizadas · 3 eliminadas · 4 bloques guardados/);
  assert.match(pagina.html(), /Resultado del archivo/);
  assert.match(pagina.html(), /MAT101/);
  assert.match(pagina.html(), /aria-live="polite"/);
  assert.equal(pagina.elementos('input').find(elemento => elemento.props.type === 'checkbox').props.checked, false);
  assert.equal(pagina.elementos('button').find(elemento => elemento.props.type === 'submit').props.disabled, true);
  await pagina.actualizar();
  assert.equal(pagina.avisos.length, 1, 'renderizar no repite la confirmación');
  await pagina.consultarGuardada();
  assert.deepEqual(pagina.avisos.at(-1), { tipo: 'cerrar', id: 1 });
  assert.match(pagina.html(), /Carga guardada/);
});

test('rechazo por fila conserva el detalle sin toast y sin modificar la carga consultada', async () => {
  const error = { fila: 4, columna: 'Horario 1', valor: 'Martes B5', codigoAsignatura: 'MAT101', nombreAsignatura: 'Matemática', mensaje: 'El bloque está reservado.' };
  const pagina = await preparar({ importar: async () => { throw new ApiError('Archivo rechazado', 400, { errores: [error], data: resultado }); } });
  await pagina.seleccionar(); await pagina.enviar();
  assert.deepEqual(pagina.avisos, []);
  for (const texto of ['No se guardó ninguna fila', 'sin guardar', '<td>4</td>', error.columna, error.valor, error.mensaje]) assert.ok(pagina.html().includes(texto), texto);
  assert.equal(pagina.solicitudes.filter(([tipo]) => tipo === 'consulta').length, 1);
  assert.match(pagina.html(), /Archivo seleccionado:/);
  assert.doesNotMatch(pagina.html(), /bloques guardados/);
  await pagina.actualizar();
  assert.match(pagina.html(), /El bloque está reservado/);
  await pagina.consultarGuardada();
  assert.match(pagina.html(), /Carga guardada/);
  assert.doesNotMatch(pagina.html(), /El bloque está reservado|No se guardó ninguna fila/);
  assert.deepEqual(pagina.avisos, []);
});

test('una respuesta perdida mantiene la incertidumbre y recuperación, sin anunciar éxito ni error efímero', async () => {
  const pagina = await preparar({ importar: async () => { throw new TypeError('Respuesta perdida.'); } });
  await pagina.seleccionar(); await pagina.enviar();
  assert.deepEqual(pagina.avisos, []);
  assert.match(pagina.html(), /Respuesta perdida. Consulta la carga guardada antes de reintentar/);
  assert.doesNotMatch(pagina.html(), /Importación completada|No se guardó ninguna fila/);
  assert.match(pagina.html(), /Archivo seleccionado:/);
  assert.equal(pagina.solicitudes.filter(([tipo]) => tipo === 'consulta').length, 2);
  await pagina.actualizar();
  assert.match(pagina.html(), /Consulta la carga guardada antes de reintentar/);
  await pagina.consultarGuardada();
  assert.doesNotMatch(pagina.html(), /Respuesta perdida/);
  assert.deepEqual(pagina.avisos, []);
});

test('guardado seguido de fallo de refresco conserva el éxito y muestra recuperación persistente de la lectura', async () => {
  let consultas = 0;
  const pagina = await preparar({ consultar: async () => {
    if (++consultas > 1) throw new Error('No se pudo consultar la cobertura.');
    return { cobertura };
  } });
  await pagina.seleccionar(); await pagina.enviar();
  assert.deepEqual(pagina.avisos, [{ tipo: 'exito', mensaje: exito, id: 1 }]);
  assert.match(pagina.html(), /4 bloques guardados/);
  assert.match(pagina.html(), /No se pudo consultar la cobertura/);
  assert.match(pagina.html(), /Reintentar consulta/);
  assert.doesNotMatch(pagina.html(), /No se guardó ninguna fila|Importación completada/);
  await pagina.actualizar();
  assert.equal(pagina.avisos.length, 1);
});

for (const salida of ['departamento', 'desmontaje']) {
  test(`el aviso propio se cierra al cambiar ${salida}`, async () => {
    const pagina = await preparar();
    await pagina.seleccionar(); await pagina.enviar();
    if (salida === 'departamento') await pagina.cambiarDepartamento(3);
    else pagina.desmontar();
    assert.deepEqual(pagina.avisos, [{ tipo: 'exito', mensaje: exito, id: 1 }, { tipo: 'cerrar', id: 1 }]);
  });

  test(`una respuesta tardía tras ${salida} no produce éxito obsoleto`, async () => {
    let resolver;
    const pagina = await preparar({ importar: () => new Promise(resolve => { resolver = resolve; }) });
    await pagina.seleccionar(); await pagina.enviar();
    assert.deepEqual(pagina.avisos, []);
    if (salida === 'departamento') await pagina.cambiarDepartamento(3);
    else pagina.desmontar();
    resolver(resultado); await pagina.actualizar();
    assert.deepEqual(pagina.avisos, []);
  });
}

test('la validación de extensión y tamaño permanece junto al archivo y enlazada al control', async () => {
  const pagina = await preparar();
  for (const archivo of [{ name: 'horarios.csv', size: 10 }, { name: 'horarios.xlsx', size: 10 * 1024 * 1024 + 1 }]) {
    await pagina.seleccionar(archivo);
    const control = pagina.elementos('input').find(elemento => elemento.props.type === 'file');
    const error = pagina.elementos('p').find(elemento => elemento.props.id === 'error-archivo-externo');
    assert.equal(control.props['aria-invalid'], true);
    assert.match(control.props['aria-describedby'], /error-archivo-externo/);
    assert.equal(error?.props.role, 'alert');
    assert.equal(error?.props.children, 'Selecciona un archivo .xlsx de hasta 10 MB.');
    assert.equal(pagina.html().match(/Selecciona un archivo .xlsx de hasta 10 MB\./g)?.length, 1);
    assert.deepEqual(pagina.avisos, []);
    assert.equal(pagina.solicitudes.filter(([tipo]) => tipo === 'importar').length, 0);
    assert.match(pagina.html(), /MAT101/);
    assert.equal(pagina.elementos('button').find(elemento => elemento.props.type === 'submit').props.disabled, true);
  }
  await pagina.seleccionar({ name: 'horarios.XLSX', size: 10 * 1024 * 1024 });
  assert.doesNotMatch(pagina.html(), /error-archivo-externo|Selecciona un archivo/);
  await pagina.enviar();
  assert.deepEqual(pagina.avisos, [{ tipo: 'exito', mensaje: exito, id: 1 }]);
});

test('el bloqueo vigente no permite importar ni genera avisos', async () => {
  const pagina = await preparar({ bloqueado: true });
  assert.equal(pagina.elementos('fieldset')[0].props.disabled, true);
  await pagina.seleccionar(); await pagina.enviar();
  assert.deepEqual(pagina.avisos, []);
  assert.equal(pagina.solicitudes.filter(([tipo]) => tipo === 'importar').length, 0);
});
