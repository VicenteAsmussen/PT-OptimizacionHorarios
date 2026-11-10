import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const planificacion = { id: 12, codigo: '2026-2', carreraNombre: 'Carrera de prueba', actual: true, estadoPlanificacion: 'preparacion' };
const resolver = createRequire(import.meta.url);
async function cargar(archivo, sustituciones = {}) {
  const ts = await import('typescript');
  const ubicacion = new URL(archivo, import.meta.url);
  let fuente = await readFile(ubicacion, 'utf8');
  fuente = fuente.replace(/^import (?!type\b)(.*?) from ['"]([^'"]+)['"];$/gm, (linea, nombres, ruta) => {
    if (ruta in sustituciones) return `const ${nombres} = ${sustituciones[ruta]};`;
    if (ruta === 'react') return linea.replace(/['"]react['"]/, JSON.stringify(pathToFileURL(resolver.resolve('react')).href));
    if (ruta === 'react-router-dom') return 'const Link = ({ to, children, ...props }) => React.createElement("a", { ...props, href: to }, children);';
    if (ruta.endsWith('.css')) return `const ${nombres} = new Proxy({}, { get: (_, clave) => clave });`;
    if (ruta.endsWith('/useAuth')) return 'const useAuth = () => ({ usuario: { id: 1, rol: "secretaria" } });';
    if (ruta === './datos') return 'const cargarPlanificaciones = async () => []; const cargarResumen = async () => ({});';
    return linea.replace(/['"]([^'"]+)['"]/, JSON.stringify(new URL(`${ruta}.ts`, ubicacion).href));
  });
  fuente = `import React from ${JSON.stringify(pathToFileURL(resolver.resolve('react')).href)};\n${fuente}`;
  const codigo = ts.transpileModule(fuente, { compilerOptions: {
    jsx: ts.JsxEmit.React, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022,
  } }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(codigo).toString('base64')}`);
}
async function renderizar(rol, opciones = {}) {
  const modulo = await cargar('./DashboardPage.tsx');
  return renderToStaticMarkup(React.createElement(modulo.VistaPanel ?? modulo.default, {
    rol, planificaciones: [planificacion], planificacionId: 12, resumen: null,
    error: '', errorResumen: '', seleccionar() {}, actualizar() {}, ...opciones,
  }));
}

test('el panel reemplaza los marcadores por contexto académico y seguimiento para secretaría', async () => {
  const html = await renderizar('secretaria', { resumen: { mensaje: '1 con disponibilidad registrada · 2 sin registrar', nota: 'No acredita factibilidad.' } });
  assert.doesNotMatch(html, /Sin datos|disponibles próximamente|summary-card/);
  assert.match(html, /Carrera de prueba/);
  assert.match(html, /2026-2/);
  assert.match(html, /Preparación/);
  assert.match(html, /1 con disponibilidad registrada/);
  assert.match(html, /href="\/app\/seguimiento-disponibilidad"/);
  assert.match(html, /href="\/app\/optimizacion\?planificacion=12"/);
  assert.doesNotMatch(html, /href="\/app\/administracion-periodos"/);
});

test('administración prioriza períodos sin apropiarse del seguimiento docente', async () => {
  const html = await renderizar('admin');
  assert.match(html, /href="\/app\/administracion-periodos"/);
  assert.match(html, /href="\/app\/asignaturas"/);
  assert.match(html, /href="\/app\/profesores"/);
  assert.doesNotMatch(html, /seguimiento-disponibilidad|disponibilidad registrada/);
});

test('el profesor solo recibe accesos propios y distingue Propuesta de Publicado', async () => {
  for (const estadoPlanificacion of ['preparacion', 'propuesta', 'publicado']) {
    const html = await renderizar('profesor', { planificaciones: [{ ...planificacion, estadoPlanificacion }] });
    assert.match(html, /href="\/app\/disponibilidad"/);
    assert.match(html, /href="\/app\/mi-horario"/);
    assert.doesNotMatch(html, /\/app\/(?:optimizacion|resultados-horarios|administracion-periodos|seguimiento-disponibilidad)/);
    if (estadoPlanificacion === 'propuesta') assert.match(html, /no está publicado/);
    if (estadoPlanificacion === 'preparacion') assert.match(html, /aún no está habilitado/);
  }
});

test('Propuesta y Publicado priorizan gestión sin inventar acciones de publicación o edición', async () => {
  for (const estadoPlanificacion of ['propuesta', 'publicado']) {
    const html = await renderizar('secretaria', { planificaciones: [{ ...planificacion, estadoPlanificacion }] });
    assert.ok(html.indexOf('href="/app/resultados-horarios?planificacion=12"') < html.indexOf('href="/app/seguimiento-disponibilidad"'));
    assert.doesNotMatch(html, /<button[^>]*>(?:Publicar|Editar)/);
  }
});

test('carga, error, ausencia de períodos y selección pendiente no se convierten en cero', async () => {
  const casos = [
    [{ planificaciones: null }, /Cargando contexto académico…/],
    [{ planificaciones: null, error: 'No se pudo consultar.' }, /role="alert"/],
    [{ planificaciones: [] }, /No hay períodos disponibles/],
    [{ planificacionId: null }, /Selecciona una carrera y un período/],
    [{ errorResumen: 'Consulta no disponible.' }, /Consulta no disponible/],
  ];
  for (const [opciones, esperado] of casos) {
    const html = await renderizar('secretaria', opciones);
    assert.match(html, esperado);
    assert.doesNotMatch(html, /0 con disponibilidad|0 sin registrar/);
  }
});

test('un período histórico queda identificado y no promete transferir selección a todos los destinos', async () => {
  const html = await renderizar('profesor', { planificaciones: [{ ...planificacion, actual: false, estadoPlanificacion: 'publicado' }] });
  assert.match(html, /Histórico/);
  assert.match(html, /Los destinos mantienen sus propios selectores/);
  assert.doesNotMatch(html, /mi-horario\?planificacion/);
});

test('el contexto único no repite un selector, pero varias opciones conservan selección etiquetada', async () => {
  assert.doesNotMatch(await renderizar('secretaria'), /<select/);
  const html = await renderizar('admin', { planificaciones: [planificacion, { ...planificacion, id: 13, actual: false }], planificacionId: null });
  assert.match(html, /<label for="planificacion-panel"/);
  assert.match(html, /<select id="planificacion-panel"/);
  assert.match(html, /Selecciona una carrera y un período/);
});

test('la consulta del resumen respeta rol, actualidad y los datos persistidos', async () => {
  const datos = await cargar('./datos.ts', {
    '../asignaturas/asignaturas.api': '{ asignaturasApi: { planificaciones: async () => [] } }',
    '../mi-horario/mi-horario.api': '{ miHorarioApi: { contexto: async () => ({ planificaciones: [] }) } }',
    '../seguimiento-disponibilidad/seguimiento.api': '{ seguimientoApi: { consultar: async () => [{ enviada: true }, { enviada: false }] } }',
    '../disponibilidad/disponibilidad.api': '{ disponibilidadApi: { consultar: async id => ({ planificaciones: [{ id, actual: true, estadoPlanificacion: "preparacion" }], seleccion: { planificacionSemestreId: id, bloquesIds: [], carga: [{ horas: 2 }], minimoBloques: 2, editable: true } }) } }',
  });
  assert.match((await datos.cargarResumen('secretaria', planificacion)).mensaje, /1 con disponibilidad registrada · 1 sin registrar/);
  assert.match((await datos.cargarResumen('profesor', planificacion)).mensaje, /No has registrado/);
  assert.equal(await datos.cargarResumen('admin', planificacion), null);
  assert.equal(await datos.cargarResumen('secretaria', { ...planificacion, actual: false }), null);
});

test('un envío vacío con carga cero no se presenta como pendiente y un contexto cambiado no produce resumen', async () => {
  for (const cambio of [false, true]) {
    const datos = await cargar('./datos.ts', {
      '../asignaturas/asignaturas.api': '{ asignaturasApi: {} }',
      '../mi-horario/mi-horario.api': '{ miHorarioApi: {} }',
      '../seguimiento-disponibilidad/seguimiento.api': '{ seguimientoApi: {} }',
      '../disponibilidad/disponibilidad.api': `{ disponibilidadApi: { consultar: async id => ({ planificaciones: [{ id, actual: ${!cambio}, estadoPlanificacion: "preparacion" }], seleccion: { planificacionSemestreId: id, bloquesIds: [], carga: [], minimoBloques: 0, editable: true } }) } }`,
    });
    if (cambio) await assert.rejects(datos.cargarResumen('profesor', planificacion), /contexto cambió/);
    else assert.match((await datos.cargarResumen('profesor', planificacion)).mensaje, /No tienes carga/);
  }
});

test('las fuentes de contexto conservan el alcance por rol y exigen elegir entre varias planificaciones actuales', async () => {
  const profesor = await cargar('./datos.ts', {
    '../asignaturas/asignaturas.api': '{ asignaturasApi: {} }',
    '../mi-horario/mi-horario.api': '{ miHorarioApi: { contexto: async () => ({ planificaciones: [{ id: 1, actual: true }, { id: 2, actual: true }, { id: 3, actual: false }] }) } }',
    '../seguimiento-disponibilidad/seguimiento.api': '{ seguimientoApi: {} }',
    '../disponibilidad/disponibilidad.api': '{ disponibilidadApi: {} }',
  });
  const contextoProfesor = await profesor.cargarPlanificaciones('profesor');
  assert.equal(contextoProfesor.inicial, null);
  assert.equal(contextoProfesor.planificaciones.length, 3);
  assert.deepEqual(await profesor.cargarPlanificaciones('otro'), { planificaciones: [], inicial: null });
  const gestion = await cargar('./datos.ts', {
    '../asignaturas/asignaturas.api': '{ asignaturasApi: { planificaciones: async () => [{ id: 1, actual: true, carrera: { nombre: "Carrera A" } }, { id: 2, actual: false, carrera: { nombre: "Carrera A" } }] } }',
    '../mi-horario/mi-horario.api': '{ miHorarioApi: {} }',
    '../seguimiento-disponibilidad/seguimiento.api': '{ seguimientoApi: {} }',
    '../disponibilidad/disponibilidad.api': '{ disponibilidadApi: {} }',
  });
  const contextoSecretaria = await gestion.cargarPlanificaciones('secretaria');
  assert.equal(contextoSecretaria.inicial, 1);
  assert.equal(contextoSecretaria.planificaciones.length, 1);
  assert.equal(contextoSecretaria.planificaciones[0].carreraNombre, 'Carrera A');
  assert.equal((await gestion.cargarPlanificaciones('admin')).planificaciones.length, 2);
});

test('los registros vacíos, el bloqueo y la consulta sin edición conservan significados diferentes', async () => {
  for (const escenario of ['vacio', 'bloqueado', 'consulta']) {
    const datos = await cargar('./datos.ts', {
      '../asignaturas/asignaturas.api': '{ asignaturasApi: {} }',
      '../mi-horario/mi-horario.api': '{ miHorarioApi: {} }',
      '../seguimiento-disponibilidad/seguimiento.api': '{ seguimientoApi: { consultar: async () => [] } }',
      '../disponibilidad/disponibilidad.api': `{ disponibilidadApi: { consultar: async id => ({ planificaciones: [{ id, actual: true, estadoPlanificacion: "preparacion" }], seleccion: { planificacionSemestreId: id, bloquesIds: [1], carga: [{ horas: 2 }], minimoBloques: 2, editable: false, bloqueadaPorOptimizacion: ${escenario === 'bloqueado'} } }) } }`,
    });
    if (escenario === 'vacio') {
      assert.match((await datos.cargarResumen('secretaria', planificacion)).mensaje, /No hay profesores con carga/);
    } else {
      const resumen = await datos.cargarResumen('profesor', planificacion);
      assert.equal(resumen.mensaje, 'Disponibilidad registrada.');
      assert.match(resumen.nota, escenario === 'bloqueado' ? /bloqueada/ : /sin edición habilitada/);
    }
  }
});

test('el diseño conserva tokens, foco y una columna móvil sin alturas fijas', async () => {
  const css = await readFile(new URL('./PanelPrincipal.module.css', import.meta.url), 'utf8');
  assert.match(css, /var\(--color-primario\)/);
  assert.match(css, /:focus-visible/);
  assert.match(css, /@media[^]*grid-template-columns:\s*minmax\(0, 1fr\)/);
  assert.doesNotMatch(css, /(?:^|[;{\s])height:\s*\d|transition:\s*all/);
});
