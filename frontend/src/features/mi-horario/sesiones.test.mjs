import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { readFile } from 'node:fs/promises';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

registerHooks({ resolve(especificador, contexto, siguiente) {
  if (contexto.parentURL?.includes('/frontend/src/') && especificador.startsWith('.') && !/\.[a-z]+$/i.test(especificador)) {
    return siguiente(`${especificador}.ts`, contexto);
  }
  return siguiente(especificador, contexto);
} });

const bloques = [
  { id: 11, dia: 'Lunes', numeroBloque: 1, horaInicio: '08:10', horaTermino: '08:50' },
  { id: 12, dia: 'Lunes', numeroBloque: 2, horaInicio: '08:50', horaTermino: '09:30' },
  { id: 13, dia: 'Lunes', numeroBloque: 3, horaInicio: '09:40', horaTermino: '10:20' },
  { id: 14, dia: 'Lunes', numeroBloque: 4, horaInicio: '10:20', horaTermino: '11:00' },
];
const clase = { id: 1, bloqueId: 11, planificacionSemestreId: 7, ofertaId: 21, tipoHoraId: 1, salaId: 3,
  oferta: { asignatura: { nombre: 'Programación' }, seccion: 1 }, tipoHora: { tipo: 'Teórica' }, sala: { nombre: 'A-101' } };
const clases = bloques.map((bloque, indice) => ({ ...clase, id: indice + 1, bloqueId: bloque.id }));

test('la consulta agrupa continuidad de oferta/tipo/sala y conserva recreos de diez minutos', async () => {
  const { crearCalendarioSesiones } = await import('./sesiones.ts');
  const anteriores = JSON.stringify({ bloques, clases });
  const calendario = crearCalendarioSesiones(bloques, clases, 7);
  const celda = calendario.filas[0].celdas[0];
  assert.equal(celda.filas, 4);
  assert.deepEqual(celda.sesiones[0].bloques.map(b => b.id), [11, 12, 13, 14]);
  assert.deepEqual(calendario.filas.slice(1).map(fila => fila.celdas[0].continuacion), [true, true, true]);
  assert.equal(JSON.stringify({ bloques, clases }), anteriores);
});

for (const [caso, cambio] of [
  ['otra oferta con el mismo nombre', { ofertaId: 22 }], ['otro tipo', { tipoHoraId: 2 }],
  ['otra sala', { salaId: 4 }], ['identidad incompleta', { ofertaId: undefined }],
]) test(`no agrupa ${caso}`, async () => {
  const { crearCalendarioSesiones } = await import('./sesiones.ts');
  const calendario = crearCalendarioSesiones(bloques.slice(0, 2), [clases[0], { ...clases[1], ...cambio }], 7);
  assert.equal(calendario.filas[0].celdas[0].filas, 1);
  assert.equal(calendario.filas[1].celdas[0].continuacion, false);
});

test('reservas, coincidencias, huecos, períodos y días mantienen sus límites', async () => {
  const { crearCalendarioSesiones } = await import('./sesiones.ts');
  const reservado = crearCalendarioSesiones(bloques, clases, 7, [12]);
  assert.equal(reservado.filas[0].celdas[0].filas, 1);
  assert.equal(reservado.filas[1].celdas[0].filas, 1);
  assert.equal(reservado.filas[2].celdas[0].filas, 2);
  const simultaneo = crearCalendarioSesiones(bloques, [...clases, { ...clases[1], id: 9 }], 7);
  assert.equal(simultaneo.filas[0].celdas[0].filas, 1);
  assert.equal(simultaneo.filas[1].celdas[0].sesiones.length, 2);
  const hueco = crearCalendarioSesiones([bloques[0], bloques[2]], [clases[0], clases[2]], 7);
  assert.equal(hueco.filas[0].celdas[0].filas, 1);
  const otraCarrera = crearCalendarioSesiones(bloques.slice(0, 2), [clases[0], { ...clases[1], planificacionSemestreId: 8 }], 7);
  assert.equal(otraCarrera.filas[0].celdas[0].filas, 1);
  const otroDia = crearCalendarioSesiones([bloques[0], { ...bloques[1], dia: 'Martes' }], clases.slice(0, 2), 7);
  assert.equal(otroDia.filas[0].celdas[0].filas, 1);
  const salto = crearCalendarioSesiones([bloques[0], { ...bloques[1], horaInicio: '09:20', horaTermino: '10:00' }], clases.slice(0, 2), 7);
  assert.equal(salto.filas[0].celdas[0].filas, 1);
});

test('los registros anteriores sin IDs conservan todos sus botones y datos', async () => {
  const { crearCalendarioSesiones } = await import('./sesiones.ts');
  const calendario = crearCalendarioSesiones(bloques, clases.map(({ ofertaId, tipoHoraId, salaId, ...datos }) => datos), 7);
  assert.deepEqual(calendario.filas.map(fila => fila.celdas[0].filas), [1, 1, 1, 1]);
  assert.equal(calendario.filas.flatMap(f => f.celdas.flatMap(c => c.sesiones)).length, 4);
});

test('reservas consecutivas vacías se agrupan sin ocultar clases ni atravesar huecos', async () => {
  const { crearCalendarioSesiones } = await import('./sesiones.ts');
  const calendario = crearCalendarioSesiones(bloques, [], 7, [11, 12, 13]);
  assert.equal(calendario.filas[0].celdas[0].filas, 3);
  assert.equal(calendario.filas[1].celdas[0].continuacion, true);
  assert.equal(calendario.filas[2].celdas[0].continuacion, true);
  assert.equal(calendario.filas[3].celdas[0].continuacion, false);
  const ocupada = crearCalendarioSesiones(bloques, [clases[1]], 7, [11, 12, 13, 14]);
  assert.equal(ocupada.filas[0].celdas[0].filas, 1);
  assert.equal(ocupada.filas[1].celdas[0].sesiones.length, 1);
  assert.equal(ocupada.filas[2].celdas[0].filas, 2);
  const hueco = crearCalendarioSesiones([bloques[0], bloques[2]], [], 7, [11, 13]);
  assert.equal(hueco.filas[0].celdas[0].filas, 1);
});

test('render de sesión única, detalle completo y sala en línea propia sin controles de edición', async () => {
  const { createServer } = await import('vite');
  const servidor = await createServer({ envFile: false, server: { middlewareMode: true, hmr: false }, appType: 'custom' });
  try {
    const { default: Calendario } = await servidor.ssrLoadModule('/src/features/mi-horario/CalendarioSemanal.tsx');
    const html = renderToStaticMarkup(React.createElement(Calendario, { bloques, horarios: clases, planificacionId: 7 }));
    assert.equal([...html.matchAll(/aria-haspopup="dialog"/g)].length, 1);
    assert.match(html, /rowSpan="4"|rowspan="4"/);
    assert.match(html, /<td[^>]*class="[^"]*celdaSesion[^"]*"[^>]*row[Ss]pan="4"/);
    assert.match(html, /08:10–11:00/);
    assert.match(html, /class="[^"]*salaClase[^"]*">A-101<\/span>/);
    assert.match(html, /class="[^"]*salaHorario[^"]*"><span class="[^"]*salaClase[^"]*">A-101<\/span>[^]*?<span class="[^"]*horasSesion[^"]*">08:10–11:00<\/span>/);
    const { default: Detalle } = await servidor.ssrLoadModule('/src/features/mi-horario/DetalleClaseDialogo.tsx');
    const detalle = renderToStaticMarkup(React.createElement(Detalle, { clase, bloque: bloques[0], bloquesSesion: bloques, cerrar: () => {} }));
    assert.match(detalle, /08:10–11:00/);
    assert.match(detalle, /4 bloques/);
    assert.doesNotMatch(html + detalle, /<input|<select|contenteditable/);
    const css = await readFile(new URL('./MiHorario.module.css', import.meta.url), 'utf8');
    assert.match(css, /\.consulta \.contenidoCelda\s*\{[^}]*min-height:\s*1\.75rem/);
    assert.match(css, /\.consulta\s*\{[^}]*--alto-fila-consulta:\s*1\.75rem/);
    assert.match(css, /\.consulta \.calendario tbody tr\s*\{[^}]*height:\s*var\(--alto-fila-consulta\)/);
    assert.match(css, /\.consulta \.celdaSesion::before[^]*?background:\s*var\(--color-azul-hover\)/);
    assert.match(css, /\.consulta \.celdaSesion \.sesionAgrupada::after\s*\{[^}]*inset:\s*0\.125rem[^}]*border-radius:\s*0\.375rem/);
    assert.match(css, /\.consulta \.celdaSesion:focus-within \.sesionAgrupada::after\s*\{[^}]*outline:\s*3px solid/);
    assert.match(css, /\.consulta \.reserva\s*\{[^}]*min-height:\s*1\.5rem/);
    const reservas = renderToStaticMarkup(React.createElement(Calendario, { bloques, horarios: [], planificacionId: 7,
      bloquesReservadosIds: [11, 12, 13] }));
    assert.equal([...reservas.matchAll(/>Reservado</g)].length, 1);
    assert.match(reservas, /class="[^"]*celdaReserva[^"]*"[^>]*row[Ss]pan="3"/);
  } finally { await servidor.close(); }
});
