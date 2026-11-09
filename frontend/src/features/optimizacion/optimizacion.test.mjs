import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';

registerHooks({ resolve(nombre, contexto, siguiente) {
  if (contexto.parentURL?.includes('/frontend/src/') && nombre.startsWith('.') && !/\.[a-z]+$/i.test(nombre)) return siguiente(`${nombre}.ts`, contexto);
  return siguiente(nombre, contexto);
} });

const recurso = { id: 'AC-Sala-32', edificio: 'AC', tipo: 'Sala', capacidad: 32, cantidad: 2, fuente: 'Confirmación de esta ejecución' };
const ejecucion = (estado = 'en_ejecucion') => ({ id: 'e1', planificacionSemestreId: 2, estado, parametros: { recursos: [recurso] }, diagnostico: null });
function almacen() {
  const filas = new Map();
  return { getItem: clave => filas.get(clave) ?? null, setItem: (clave, valor) => filas.set(clave, valor), removeItem: clave => filas.delete(clave) };
}
const cargar = () => import('./seguimiento.ts');

test('supuesto de laboratorios conserva capacidad 60, cantidad inicial 6 y límites sin mutar entradas', async () => {
  const m = await import('./modelo.ts');
  for (const cantidad of [undefined, '0', '10000']) {
    const borrador = m.crearLaboratoriosModelo(cantidad);
    const recursos = m.prepararRecursos([], [], [borrador], true);
    assert.equal(recursos[0].capacidad, 60); assert.equal(recursos[0].cantidad, cantidad === undefined ? 6 : Number(cantidad));
    assert.equal(recursos[0].id, 'laboratorios-modelo'); assert.equal(recursos[0].tipo, 'Laboratorio');
    assert.deepEqual(Object.keys(recursos[0]).sort(), ['id', 'edificio', 'tipo', 'capacidad', 'cantidad', 'fuente'].sort());
  }
  for (const cantidad of ['', '-1', '1.5', '10001']) {
    const borrador = m.crearLaboratoriosModelo(cantidad); const anterior = structuredClone(borrador);
    assert.throws(() => m.prepararRecursos([], [], [borrador], true), /entero/); assert.deepEqual(borrador, anterior);
  }
});
test('salas mantienen categorías separadas, sugerencia recibida de mitad superior y límites enteros', async () => {
  const m = await import('./modelo.ts');
  const categorias = [{ ...recurso, cantidadCatalogo: 5, cantidadSugerida: 3 }, { ...recurso, id: 'AA-Sala-32', edificio: 'AA', cantidadCatalogo: 3, cantidadSugerida: 2 }];
  const salas = m.sugerirRecursos(categorias); const anterior = structuredClone(categorias);
  assert.deepEqual(salas.map(s => s.cantidad), ['3', '2']);
  assert.deepEqual(m.prepararRecursos(categorias, salas, [], false).map(r => r.edificio), ['AC', 'AA']);
  for (const cantidad of ['0', '5']) assert.equal(m.prepararRecursos(categorias, [{ ...salas[0], cantidad }], [], false)[0].cantidad, Number(cantidad));
  for (const cantidad of ['', '-1', '1.5', '6', '10001']) assert.throws(() => m.prepararRecursos(categorias, [{ ...salas[0], cantidad }], [], false));
  assert.deepEqual(categorias, anterior);
});

test('doble solicitud comparte POST, clave y parámetros sin crear otra ejecución', async () => {
  const { crearSeguimiento } = await cargar();
  let resolver; const llamadas = [];
  const servicio = { iniciar: (id, datos) => { llamadas.push({ id, datos }); return new Promise(r => { resolver = r; }); } };
  const s = crearSeguimiento(servicio, almacen(), 'cuenta');
  const primera = s.iniciar(2, [recurso]); const segunda = s.iniciar(2, [{ ...recurso, cantidad: 3 }]);
  await Promise.resolve();
  assert.equal(llamadas.length, 1); assert.equal(primera, segunda);
  assert.ok(llamadas[0].datos.claveIdempotencia.length >= 8);
  assert.equal(llamadas[0].datos.recursos[0].cantidad, 2);
  resolver(ejecucion()); await primera;
  assert.equal(s.estado()[2].ejecucion.estado, 'en_ejecucion');
  await assert.rejects(s.iniciar(2, [recurso]), /activa/);
  assert.equal(llamadas.length, 1);
});

test('respuesta perdida conserva solicitud tras recarga y solo reenvía por acción explícita', async () => {
  const { crearSeguimiento } = await cargar(); const storage = almacen(); let solicitud;
  let s = crearSeguimiento({ iniciar: async (_, datos) => { solicitud = datos; throw new Error('Conexión interrumpida'); } }, storage, 'cuenta');
  await assert.rejects(s.iniciar(2, [recurso]));
  assert.equal(s.estado()[2].incierta, true);
  let posts = 0;
  s = crearSeguimiento({ ultima: async () => null, iniciar: async (_, datos) => { posts++; assert.deepEqual(datos, solicitud); return ejecucion(); } }, storage, 'cuenta');
  await s.actualizar(2); assert.equal(posts, 0);
  await s.iniciar(2, [{ ...recurso, cantidad: 9 }]); assert.equal(posts, 1);
});

test('recupera última e ID, detecta terminales una sola vez y no inicia al consultar', async () => {
  const { crearSeguimiento } = await cargar(); const avisos = []; const consultas = [];
  const s = crearSeguimiento({ ultima: async id => { consultas.push(id); return ejecucion(); }, consultar: async id => { consultas.push(id); return ejecucion('aplicada'); } }, almacen(), 'cuenta');
  s.alTerminar(e => avisos.push(e));
  await s.actualizar(2); await s.actualizar(2); await s.actualizar(2);
  assert.deepEqual(consultas, [2, 'e1', 2]); assert.equal(avisos.length, 1); assert.equal(avisos[0].estado, 'aplicada');
});

test('terminal histórico no fuerza navegación ni notificación y cuenta distinta no hereda solicitud', async () => {
  const { crearSeguimiento } = await cargar(); const storage = almacen(); let avisos = 0;
  const a = crearSeguimiento({ iniciar: async () => { throw new Error('sin respuesta'); } }, storage, 'a');
  await assert.rejects(a.iniciar(2, [recurso]));
  const b = crearSeguimiento({ ultima: async () => ejecucion('aplicada') }, storage, 'b');
  b.alTerminar(() => avisos++); await b.actualizar(2);
  assert.equal(avisos, 0); assert.equal(b.estado()[2].incierta, false);
});

test('errores backend conservan mensaje y no reintentan automáticamente', async () => {
  const { crearSeguimiento } = await cargar(); let posts = 0;
  const s = crearSeguimiento({ iniciar: async () => { posts++; throw Object.assign(new Error('Sin permiso para esta carrera'), { status: 403 }); }, ultima: async () => { throw new Error('Consulta no disponible'); } }, almacen(), 'cuenta');
  await assert.rejects(s.iniciar(2, [recurso]), /Sin permiso/);
  assert.equal(s.estado()[2].incierta, false); assert.equal(posts, 1);
  await s.actualizar(2); assert.match(s.estado()[2].error, /Consulta no disponible/);
});

test('permiso, categorías, laboratorios y límites respetan el contrato sin inventario implícito', async () => {
  const m = await import('./modelo.ts');
  for (const rol of ['admin', 'secretaria']) assert.equal(m.puedeOptimizar(rol), true);
  for (const rol of ['profesor', null, undefined]) assert.equal(m.puedeOptimizar(rol), false);
  const categorias = [{ ...recurso, cantidadCatalogo: 4, cantidadSugerida: 2 }, { ...recurso, id: 'AA-Sala-32', edificio: 'AA', cantidadCatalogo: 2, cantidadSugerida: 1 }];
  const borrador = m.sugerirRecursos(categorias);
  assert.equal(borrador.length, 2); assert.equal(borrador[0].cantidad, '2'); assert.equal(borrador[1].edificio, 'AA');
  assert.throws(() => m.prepararRecursos(categorias, borrador, [], true), /laboratorio/i);
  assert.throws(() => m.prepararRecursos(categorias, [{ ...borrador[0], cantidad: '5' }], [], false), /catálogo/);
  assert.throws(() => m.prepararRecursos(categorias, [{ ...borrador[0], cantidad: '' }], [], false), /entero/);
  const laboratorio = { id: 'lab-1', edificio: 'Departamento', capacidad: '40', cantidad: '3', fuente: 'Total confirmado por el departamento' };
  const datos = m.prepararRecursos(categorias, borrador, [laboratorio], true);
  assert.equal(datos[2].cantidad, 3); assert.equal(datos[2].capacidad, 40); assert.equal(datos[2].tipo, 'Laboratorio');
});

test('estados reales, faltantes y disponibilidad no se confunden con éxito ni optimalidad', async () => {
  const m = await import('./modelo.ts');
  for (const estado of ['en_ejecucion', 'aplicada', 'infactible', 'carga_incompleta', 'limite_tiempo', 'error', 'interrumpida', 'datos_desactualizados']) assert.ok(m.etiquetasEstado[estado]);
  assert.deepEqual(m.ordenarDisponibilidad([{ profesorId: 1, bloquesDisponibles: 20 }, { profesorId: 2, bloquesDisponibles: 4 }]).map(f => f.profesorId), [2, 1]);
  assert.equal(m.destinoAlTerminar(ejecucion('aplicada'), '/app/optimizacion', '?planificacion=2'), 'redirigir');
  assert.equal(m.destinoAlTerminar(ejecucion('aplicada'), '/app/asignaturas', ''), 'notificar');
  assert.equal(m.destinoAlTerminar(ejecucion('aplicada'), '/app/optimizacion', '?planificacion=3'), 'notificar');
  assert.equal(m.destinoAlTerminar(ejecucion('infactible'), '/app/optimizacion', '?planificacion=2'), 'notificar');
});

test('API transporta contrato real, cookies, errores 400/403/409 y no agrega aplicar/reemplazar', async () => {
  const { optimizacionApi: api } = await import('./optimizacion.api.ts');
  const anterior = globalThis.fetch; const llamadas = [];
  try {
    globalThis.fetch = async (url, opciones) => {
      llamadas.push([url, opciones]); assert.equal(opciones.credentials, 'include');
      return Response.json({ status: 'success', data: url.endsWith('ultima-ejecucion') ? null : ejecucion() }, { status: opciones.method === 'POST' ? 202 : 200 });
    };
    await api.preparar(2); assert.equal(await api.ultima(2), null); await api.consultar('e1');
    const solicitud = { claveIdempotencia: 'solicitud-prueba', recursos: [recurso] };
    await api.iniciar(2, solicitud);
    assert.deepEqual(llamadas.map(([u]) => u.replace('http://localhost:3000/api/', '')), [
      'optimizacion/planificaciones/2/preparacion', 'optimizacion/planificaciones/2/ultima-ejecucion', 'optimizacion/ejecuciones/e1', 'optimizacion/planificaciones/2/ejecuciones',
    ]);
    assert.deepEqual(JSON.parse(llamadas.at(-1)[1].body), solicitud);
    for (const status of [400, 403, 409, 500]) {
      globalThis.fetch = async () => Response.json({ message: `Rechazo ${status}` }, { status });
      await assert.rejects(api.iniciar(2, solicitud), e => e.status === status && e.message === `Rechazo ${status}`);
    }
  } finally { globalThis.fetch = anterior; }
});

test('consulta anterior al POST no sobrescribe la ejecución confirmada', async () => {
  const { crearSeguimiento } = await cargar(); let resolver;
  const s = crearSeguimiento({ ultima: () => new Promise(r => { resolver = r; }), iniciar: async () => ejecucion() }, almacen(), 'cuenta');
  const consulta = s.actualizar(2); await Promise.resolve();
  await s.iniciar(2, [recurso]); resolver(null); await consulta;
  assert.equal(s.estado()[2].ejecucion.id, 'e1');
});

test('última histórica con mismos parámetros no confirma una solicitud incierta', async () => {
  const { crearSeguimiento } = await cargar();
  const s = crearSeguimiento({ iniciar: async () => { throw new Error('Respuesta perdida'); }, ultima: async () => ejecucion('aplicada') }, almacen(), 'cuenta');
  let avisos = 0; s.alTerminar(() => avisos++);
  await assert.rejects(s.iniciar(2, [recurso])); await s.actualizar(2);
  assert.equal(s.estado()[2].incierta, true); assert.equal(avisos, 0);
});

test('seguimiento recuperado tras recarga notifica el término y no repite POST', async () => {
  const { crearSeguimiento } = await cargar(); const storage = almacen();
  let s = crearSeguimiento({ ultima: async () => ejecucion() }, storage, 'cuenta'); await s.actualizar(2);
  let avisos = 0;
  s = crearSeguimiento({ ultima: async () => ejecucion('interrumpida') }, storage, 'cuenta'); s.alTerminar(() => avisos++);
  await s.actualizar(2); await s.actualizar(2); assert.equal(avisos, 1);
});

test('almacenamiento denegado no inicia un POST sin clave recuperable', async () => {
  const { crearSeguimiento } = await cargar(); let posts = 0;
  const s = crearSeguimiento({ iniciar: async () => { posts++; return ejecucion(); } }, { getItem() { throw new Error(); }, setItem() { throw new Error(); } }, 'cuenta');
  await assert.rejects(s.iniciar(2, [recurso]), /almacenamiento/); assert.equal(posts, 0);
});

test('el reinicio remoto elimina el resultado confirmado y su referencia local sin avisar ni ejecutar', async () => {
  const { crearSeguimiento } = await cargar(); const storage = almacen(); let ultima = ejecucion('aplicada'); let avisos = 0;
  const s = crearSeguimiento({ iniciar: async () => ultima, ultima: async () => ultima }, storage, 'cuenta');
  await s.iniciar(2, [recurso]); s.alTerminar(() => avisos++);
  assert.ok(storage.getItem('optimizacion:cuenta:2'));
  ultima = null; await s.actualizar(2);
  assert.equal(s.estado()[2].ejecucion, null); assert.equal(s.estado()[2].error, '');
  assert.equal(s.estado()[2].incierta, false); assert.equal(storage.getItem('optimizacion:cuenta:2'), null);
  assert.equal(avisos, 0);
});

test('un ID activo eliminado se reconcilia con la ejecución actual del período', async () => {
  const { crearSeguimiento } = await cargar(); let ultima = ejecucion(); let consultas = 0;
  const s = crearSeguimiento({ ultima: async () => ultima, consultar: async () => {
    consultas++; throw Object.assign(new Error('Ejecución no encontrada.'), { status: 404 });
  } }, almacen(), 'cuenta');
  await s.actualizar(2); ultima = null; await s.actualizar(2);
  assert.equal(consultas, 1); assert.equal(s.estado()[2].ejecucion, null); assert.equal(s.estado()[2].error, '');
  ultima = { ...ejecucion('error'), id: 'e2', diagnostico: { mensaje: 'No se obtuvo solución.' } };
  await s.actualizar(2); assert.deepEqual(s.estado()[2].ejecucion, ultima);
});

test('un rechazo de permisos no se oculta como reinicio ni dispara una consulta alternativa', async () => {
  const { crearSeguimiento } = await cargar(); let ultimas = 0; let posts = 0;
  const s = crearSeguimiento({ ultima: async () => { ultimas++; return ejecucion(); },
    consultar: async () => { throw Object.assign(new Error('Sin permiso'), { status: 403 }); },
    iniciar: async () => { posts++; },
  }, almacen(), 'cuenta');
  await s.actualizar(2); await s.actualizar(2);
  assert.equal(s.estado()[2].ejecucion.id, 'e1'); assert.equal(s.estado()[2].error, 'Sin permiso');
  assert.equal(ultimas, 1); assert.equal(posts, 0);
});

test('el diagnóstico fallido permanece hasta confirmar otro intento, que usa una clave nueva', async () => {
  const { crearSeguimiento } = await cargar(); const solicitudes = []; let resolver;
  const fallida = { ...ejecucion('error'), diagnostico: { mensaje: 'Error del modelo.' } };
  const s = crearSeguimiento({ ultima: async () => fallida, iniciar: async (_, datos) => {
    solicitudes.push(datos); return new Promise(r => { resolver = r; });
  } }, almacen(), 'cuenta');
  await s.actualizar(2); assert.deepEqual(s.estado()[2].ejecucion, fallida);
  const pendiente = s.iniciar(2, [recurso]); await Promise.resolve();
  assert.deepEqual(s.estado()[2].ejecucion, fallida);
  resolver({ ...ejecucion(), id: 'e2' }); await pendiente;
  assert.equal(s.estado()[2].ejecucion.id, 'e2'); assert.equal(solicitudes.length, 1);
});
