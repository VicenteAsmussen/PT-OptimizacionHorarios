import test from 'node:test';
import assert from 'node:assert/strict';

const cargar = () => import('./datos.ts');
test('subjects sort by numeric curriculum semester, then name, without mutating input', async () => {
  const { filtrarAsignaturas } = await cargar();
  const asignaturas = Object.freeze([
    { codigo: 'INF-10', nombre: 'A', departamentoId: 1, semestreMalla: 10 },
    { codigo: 'INF-2B', nombre: 'Z', departamentoId: 1, semestreMalla: 2 },
    { codigo: 'INF-14', nombre: 'B', departamentoId: 2, semestreMalla: 14 },
    { codigo: 'INF-1', nombre: 'Z', departamentoId: 1, semestreMalla: 1 },
    { codigo: 'INF-2A', nombre: 'A', departamentoId: 1, semestreMalla: 2 },
  ].map(Object.freeze));
  const originales = [...asignaturas];
  assert.deepEqual(filtrarAsignaturas(asignaturas).map(a => a.codigo),
    ['INF-1', 'INF-2A', 'INF-2B', 'INF-10', 'INF-14']);
  assert.deepEqual(filtrarAsignaturas(asignaturas, 'inf', '1', '2').map(a => a.codigo),
    ['INF-2A', 'INF-2B']);
  assert.deepEqual(asignaturas, originales);
});
const profesores = [
  { id: 1, nombre: 'Ana Pérez', rut: '12.345.678-5', departamento: { nombre: 'A' } },
  { id: 2, nombre: 'Berta', rut: '6000000-K', departamento: { nombre: 'B' } },
];
const ofertas = [
  { id: 1, asignaturaCodigo: 'A', planificacionSemestreId: 1, seccion: 1 },
  { id: 2, asignaturaCodigo: 'A', planificacionSemestreId: 1, seccion: 3 },
  { id: 3, asignaturaCodigo: 'A', planificacionSemestreId: 2, seccion: 2 },
  { id: 4, asignaturaCodigo: 'B', planificacionSemestreId: 1, seccion: 2 },
];
test('filtros combinan nombre/código, departamento y semestre de malla sin mutar', async () => {
  const { filtrarAsignaturas } = await cargar();
  const asignaturas = Object.freeze([
    { codigo: 'INF-1', nombre: 'Álgebra', departamentoId: 1, semestreMalla: 2 },
    { codigo: 'INF-2', nombre: 'Bases', departamentoId: 2, semestreMalla: 4 },
  ].map(Object.freeze));
  assert.deepEqual(filtrarAsignaturas(asignaturas, 'algebra', '1', '2'), [asignaturas[0]]);
  assert.deepEqual(filtrarAsignaturas(asignaturas, 'inf', '2', ''), [asignaturas[1]]);
  assert.deepEqual(filtrarAsignaturas(asignaturas, '', '1', '4'), []);
});
test('profesor se busca por nombre o RUT con puntuación, sin limitar departamento', async () => {
  const { buscarProfesores } = await cargar();
  for (const consulta of ['ANA', 'perez', '123456785', '12.345.678-5', '678-5']) {
    assert.deepEqual(buscarProfesores(profesores, consulta), [profesores[0]]);
  }
  assert.deepEqual(buscarProfesores(profesores, '6000000k'), [profesores[1]]);
  assert.equal(buscarProfesores(profesores, '').length, 2);
  assert.deepEqual(buscarProfesores(profesores, '...'), []);
});
test('semestre por defecto actual o selección explícita, nunca primero arbitrario', async () => {
  const { planificacionInicial } = await cargar();
  assert.equal(planificacionInicial([{ id: 1 }, { id: 2, actual: true }]), 2);
  assert.equal(planificacionInicial([{ id: 1 }]), null);
  assert.equal(planificacionInicial([]), null);
  assert.equal(planificacionInicial([{ id: 1, carreraId: 1, actual: true }, { id: 2, carreraId: 2, actual: true }]), null);
});
test('aislamiento y conteos por asignatura/semestre; números libres sin renumerar', async () => {
  const { ofertasDePlanificacion, seccionesLibres } = await cargar();
  const propias = ofertasDePlanificacion(ofertas, 'A', 1);
  assert.deepEqual(propias.map(o => o.id), [1, 2]);
  assert.deepEqual(seccionesLibres(propias), [2, 4, 5]);
  assert.deepEqual(seccionesLibres(propias, 2), [2, 3, 4, 5]);
  assert.equal(seccionesLibres(Array.from({ length: 5 }, (_, i) => ({ id: i, seccion: i + 1 }))).length, 0);
  assert.deepEqual(seccionesLibres(propias.filter(o => o.id !== 1)), [1, 2, 4, 5]);
  assert.deepEqual(ofertasDePlanificacion(ofertas, 'A', null), []);
});
test('payload allows pending teachers and validates typed assignments, section and capacity', async () => {
  const { prepararOferta } = await cargar();
  const entrada = { seccion: '2', cupos: '0', asignaciones: [{ tipoHoraId: 1, profesorId: 1 }] };
  assert.deepEqual(prepararOferta(entrada, profesores, [1, 2]), { seccion: 2, cupos: 0, asignaciones: entrada.asignaciones });
  assert.deepEqual(prepararOferta({ ...entrada, asignaciones: [{ tipoHoraId: 1, profesorId: null }] }, profesores, [2]), { seccion: 2, cupos: 0, asignaciones: [] });
  for (const profesorId of ['', 'Ana', '1', 999]) {
    assert.throws(() => prepararOferta({ ...entrada, asignaciones: [{ tipoHoraId: 1, profesorId }] }, profesores, [2]), /profesor/i);
  }
  for (const seccion of ['', '0', '6', '1.5', '1']) {
    assert.throws(() => prepararOferta({ ...entrada, seccion }, profesores, [2]), /sección/i);
  }
  for (const cupos of ['', '-1', '1.5', 'NaN', 'Infinity']) {
    assert.throws(() => prepararOferta({ ...entrada, cupos }, profesores, [2]), /cupos/i);
  }
});
test('pending indicators compare curriculum types to saved teacher assignments', async () => {
  const { tiposPendientes, prepararOferta } = await cargar();
  const asignatura = { tiposHora: [1, 2, 3].map(tipoHoraId => ({ tipoHoraId, horas: 2, tipoHora: { tipo: `Type ${tipoHoraId}` } })) };
  const oferta = { asignaciones: [{ tipoHoraId: 1, profesorId: 1 }] };
  assert.deepEqual(tiposPendientes(asignatura, oferta).map(t => t.tipoHoraId), [2, 3]);
  const asignaciones = [1, 2, 3].map(tipoHoraId => ({ tipoHoraId, profesorId: 1 }));
  assert.deepEqual(prepararOferta({ seccion: '1', cupos: '0', asignaciones }, profesores, [1]).asignaciones, asignaciones);
  assert.deepEqual(tiposPendientes(asignatura, { asignaciones }), []);
  const conTipoSinHoras = { tiposHora: [...asignatura.tiposHora, { tipoHoraId: 4, horas: 0 }] };
  assert.deepEqual(tiposPendientes(conTipoSinHoras, { asignaciones: [] }).map(t => t.tipoHoraId), [1, 2, 3]);
  assert.throws(() => prepararOferta({ seccion: '1', cupos: '0', asignaciones: [asignaciones[0], asignaciones[0]] }, profesores, [1]), /tipo/i);
});
