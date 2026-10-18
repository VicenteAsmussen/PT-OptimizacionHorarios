import test from 'node:test';
import assert from 'node:assert/strict';

const cargar = () => import('./datos.ts');
const profesores = [
  { id: 1, nombre: 'Ana Pérez', rut: '12.345.678-5', departamento: { nombre: 'A' } },
  { id: 2, nombre: 'Berta', rut: '6000000-K', departamento: { nombre: 'B' } },
];
const ofertas = [
  { id: 1, asignaturaCodigo: 'A', semestreId: 1, seccion: 1 },
  { id: 2, asignaturaCodigo: 'A', semestreId: 1, seccion: 3 },
  { id: 3, asignaturaCodigo: 'A', semestreId: 2, seccion: 2 },
  { id: 4, asignaturaCodigo: 'B', semestreId: 1, seccion: 2 },
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
  const { semestreInicial } = await cargar();
  assert.equal(semestreInicial([{ id: 1 }, { id: 2, actual: true }]), 2);
  assert.equal(semestreInicial([{ id: 1 }]), null);
  assert.equal(semestreInicial([]), null);
});
test('aislamiento y conteos por asignatura/semestre; números libres sin renumerar', async () => {
  const { ofertasDelSemestre, seccionesLibres } = await cargar();
  const propias = ofertasDelSemestre(ofertas, 'A', 1);
  assert.deepEqual(propias.map(o => o.id), [1, 2]);
  assert.deepEqual(seccionesLibres(propias), [2, 4, 5]);
  assert.deepEqual(seccionesLibres(propias, 2), [2, 3, 4, 5]);
  assert.equal(seccionesLibres(Array.from({ length: 5 }, (_, i) => ({ id: i, seccion: i + 1 }))).length, 0);
  assert.deepEqual(seccionesLibres(propias.filter(o => o.id !== 1)), [1, 2, 4, 5]);
  assert.deepEqual(ofertasDelSemestre(ofertas, 'A', null), []);
});
test('payload exige profesor seleccionado existente, sección única 1..5 y cupos enteros no negativos', async () => {
  const { prepararOferta } = await cargar();
  const entrada = { seccion: '2', cupos: '0', profesorId: 1 };
  assert.deepEqual(prepararOferta(entrada, profesores, [1, 2]), { seccion: 2, cupos: 0, profesorId: 1 });
  for (const profesorId of [null, '', 'Ana', '1', 999]) {
    assert.throws(() => prepararOferta({ ...entrada, profesorId }, profesores, [2]), /profesor/i);
  }
  for (const seccion of ['', '0', '6', '1.5', '1']) {
    assert.throws(() => prepararOferta({ ...entrada, seccion }, profesores, [2]), /sección/i);
  }
  for (const cupos of ['', '-1', '1.5', 'NaN', 'Infinity']) {
    assert.throws(() => prepararOferta({ ...entrada, cupos }, profesores, [2]), /cupos/i);
  }
});
