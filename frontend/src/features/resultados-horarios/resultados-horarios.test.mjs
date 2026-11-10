import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';

registerHooks({ resolve(nombre, contexto, siguiente) {
  if (contexto.parentURL?.includes('/frontend/src/') && nombre.startsWith('.') && !/\.[a-z]+$/i.test(nombre)) {
    return siguiente(`${nombre}.ts`, contexto);
  }
  return siguiente(nombre, contexto);
} });

export const bloques = Array.from({ length: 6 }, (_, i) => ({ id: 90 - i * 3, dia: 'Lunes', numeroBloque: i + 1,
  horaInicio: ['08:10', '08:50', '09:40', '10:20', '11:10', '11:50'][i],
  horaTermino: ['08:50', '09:30', '10:20', '11:00', '11:50', '12:30'][i] }));
export const sesion = { idsHorarios: [11, 12, 13, 14], bloquesIds: bloques.slice(0, 4).map(b => b.id),
  ofertaId: 5, asignatura: { codigo: '100', nombre: 'Estructuras de Datos', semestreMalla: 3 }, seccion: 1,
  profesor: { id: 8, nombre: 'Docente' }, profesorId: 8, tipoHora: { id: 1, tipo: 'Teórica' },
  dia: 'Lunes', horaInicio: '08:10', horaTermino: '11:00', salas: [null, null, null, null], estadoSala: 'pendiente', editable: true };
export const resultado = { planificacion: { id: 2, codigo: '2026-2', carreraId: 1, actual: true, estadoPlanificacion: 'propuesta' },
  revision: 'a'.repeat(64), bloques: [...bloques, ...bloques.map(b => ({ ...b, id: b.id + 100, dia: 'Martes' }))], sesiones: [sesion], pendientesSala: 1,
  disponibilidades: [...bloques, ...bloques.map(b => ({ ...b, id: b.id + 100 }))].map(b => ({ profesorId: 8, bloqueId: b.id, planificacionSemestreId: 2 })) };

test('S2 tres concurrencias parciales conservan una tarjeta, identidad y carril por sesión', async () => {
  const { createServer } = await import('vite');
  const { createElement } = await import('react');
  const { renderToStaticMarkup } = await import('react-dom/server');
  const servidor = await createServer({ envFile: false, server: { middlewareMode: true }, appType: 'custom' });
  const sesiones = [sesion,
    { ...sesion, seccion: 2, idsHorarios: [21, 22], bloquesIds: [87, 84], horaInicio: '08:50', horaTermino: '10:20' },
    { ...sesion, seccion: 3, idsHorarios: [31, 32, 33], bloquesIds: [84, 81, 78], horaInicio: '09:40', horaTermino: '11:50',
      salas: [{ id: 1, nombre: 'A101' }, { id: 2, nombre: 'A102' }, { id: 2, nombre: 'A102' }], estadoSala: 'asignada' }];
  try {
    const { default: Calendario } = await servidor.ssrLoadModule('/src/features/resultados-horarios/CalendarioResultados.tsx');
    const html = renderToStaticMarkup(createElement(Calendario, { resultado: { ...resultado, sesiones }, nivel: '3', seleccionar() {} }));
    assert.equal([...html.matchAll(/data-sesion=/g)].length, 3);
    for (const carril of [0, 1, 2]) assert.match(html, new RegExp(`data-carril="${carril}"`));
    for (const texto of ['Sec. 1', 'Sec. 2', 'Sec. 3', 'Estructuras de Datos', 'Salas por tramo']) assert.ok(html.includes(texto), texto);
    const tarjetas = [...html.matchAll(/<button[^>]*data-sesion=[^>]*>(.*?)<\/button>/gs)].map(m => m[1].replace(/<[^>]*>/g, ''));
    assert.equal(tarjetas.length, 3);
    for (const texto of tarjetas) {
      assert.doesNotMatch(texto, /Docente|100 —|08:10|09:40|A101|A102/);
      assert.match(texto, /Sec\./);
    }
    assert.match(html, /grid-row:2 \/ span 4/);
    assert.doesNotMatch(html, /title=/);
  } finally { await servidor.close(); }
});

test('todas las sesiones usan siglas y conservan identidad, duración y nombres completos accesibles', async () => {
  const { createServer } = await import('vite');
  const { createElement } = await import('react');
  const { renderToStaticMarkup } = await import('react-dom/server');
  const servidor = await createServer({ envFile: false, server: { middlewareMode: true }, appType: 'custom' });
  const externas = [1, 2, 3].map(seccion => ({ ...sesion, idsHorarios: [seccion * 100, seccion * 100 + 1],
    bloquesIds: [90, 87], horaTermino: '09:30', seccion, estadoSala: 'externa', editable: false,
    asignatura: { ...sesion.asignatura, nombre: 'Cálculo Diferencial' } }));
  const aislada = { ...sesion, idsHorarios: [51, 52], bloquesIds: [78, 75], horaInicio: '11:10', horaTermino: '12:30' };
  try {
    const { default: Calendario } = await servidor.ssrLoadModule('/src/features/resultados-horarios/CalendarioResultados.tsx');
    const renderizar = sesiones => renderToStaticMarkup(createElement(Calendario, { resultado: { ...resultado, sesiones }, nivel: '3', seleccionar() {} }));
    const html = renderizar([...externas, aislada]);
    assert.match(html, /repeat\(3, 7rem\)/);
    const tarjetas = [...html.matchAll(/<button[^>]*data-sesion=[^>]*>(.*?)<\/button>/gs)].map(([etiqueta, contenido]) => ({ etiqueta, contenido }));
    assert.equal(tarjetas.length, 4);
    for (const [indice, tarjeta] of tarjetas.slice(0, 3).entries()) {
      assert.match(tarjeta.etiqueta, /data-compacta="true"/);
      assert.match(tarjeta.etiqueta, /aria-label="Cálculo Diferencial/);
      assert.match(tarjeta.etiqueta, /grid-row:2 \/ span 2/);
      assert.ok(tarjeta.contenido.includes(`<strong>CD</strong><span>Sec. ${indice + 1} · Teo.</span><span>H. ext.</span>`));
      assert.match(tarjeta.etiqueta, /_sesionExterna_/);
    }
    assert.match(tarjetas[3].etiqueta, /data-compacta="true"/);
    assert.match(tarjetas[3].etiqueta, /aria-label="Estructuras de Datos/);
    assert.match(tarjetas[3].contenido, /<strong>EDD<\/strong><span>Sec. 1 · Teo\.<\/span><span>Pend\. sala<\/span>/);
    const distinta = { ...externas[1], asignatura: { ...externas[1].asignatura, codigo: '200', nombre: 'Cálculo Diferenciado' } };
    const colision = renderizar([externas[0], distinta]);
    assert.match(colision, /CD · 100/);
    assert.match(colision, /CD · 200/);
  } finally { await servidor.close(); }
});

test('S2 filas compactas usan altura intrínseca sin recortar nombres ni salas variables', async () => {
  const { createServer } = await import('vite');
  const { createElement } = await import('react');
  const { renderToStaticMarkup } = await import('react-dom/server');
  const { readFile } = await import('node:fs/promises');
  const servidor = await createServer({ envFile: false, server: { middlewareMode: true }, appType: 'custom' });
  const larga = { ...sesion, idsHorarios: [51, 52], bloquesIds: [90, 87], horaTermino: '09:30', estadoSala: 'asignada',
    asignatura: { ...sesion.asignatura, nombre: 'Introducción a la administración de sistemas distribuidos y redes de comunicaciones' },
    profesor: { nombre: 'Docente de sistemas distribuidos y redes' }, salas: [{ id: 1, nombre: 'Laboratorio de redes del edificio de ingeniería' }, { id: 2, nombre: 'Sala de proyectos interdisciplinarios' }] };
  try {
    const { default: Calendario } = await servidor.ssrLoadModule('/src/features/resultados-horarios/CalendarioResultados.tsx');
    const renderizar = sesiones => renderToStaticMarkup(createElement(Calendario, { resultado: { ...resultado, sesiones }, nivel: '3', seleccionar() {} }));
    const html = renderizar([larga]);
    assert.match(html, /grid-template-rows:3rem repeat\(6, minmax\(2.75rem, auto\)\)/);
    assert.match(renderizar([larga, { ...larga, idsHorarios: [61, 62], seccion: 2 }]), /grid-template-rows:3rem repeat\(6, minmax\(2.75rem, auto\)\)/);
    for (const texto of [larga.asignatura.nombre, 'Sec. 1', 'Teórica', 'Salas por tramo']) assert.ok(html.includes(texto), texto);
    assert.doesNotMatch(html, />Sala asignada</);
    const css = await readFile(new URL('./calendario/Calendario.module.css', import.meta.url), 'utf8');
    const tarjeta = css.match(/\.clase\s*\{([^}]+)\}/)?.[1];
    assert.match(tarjeta, /min-height:\s*max-content/);
    assert.match(tarjeta, /overflow:\s*visible/);
    assert.doesNotMatch(css, /line-clamp|text-overflow:\s*ellipsis/);
  } finally { await servidor.close(); }
});

test('S11 reservas continuas ocupan el día completo sin carril extra ni ocultar sesiones', async () => {
  const { createServer } = await import('vite');
  const { createElement } = await import('react');
  const { renderToStaticMarkup } = await import('react-dom/server');
  const servidor = await createServer({ envFile: false, server: { middlewareMode: true }, appType: 'custom' });
  try {
    const { distribuirReservas } = await servidor.ssrLoadModule('/src/features/resultados-horarios/calendario/disposicion.ts');
    const { default: Calendario } = await servidor.ssrLoadModule('/src/features/resultados-horarios/CalendarioResultados.tsx');
    const ids = [90, 87, 84, 78, 190];
    const reservas = distribuirReservas(resultado.bloques, ids);
    assert.deepEqual(reservas.map(r => r.bloquesIds), [[90, 87, 84], [78], [190]]);
    assert.deepEqual(reservas.map(r => [r.inicio, r.fin]), [[0, 3], [4, 5], [0, 1]]);
    const contexto = { ...resultado, bloquesReservadosIds: ids };
    const html = renderToStaticMarkup(createElement(Calendario, { resultado: contexto, nivel: '3', seleccionar() {} }));
    assert.equal([...html.matchAll(/data-reserva=/g)].length, 3);
    assert.match(html, /data-reserva="90,87,84"[^>]*grid-column:2 \/ span 1;grid-row:2 \/ span 3/);
    assert.match(html, /grid-template-columns:7rem repeat\(1, 14rem\) repeat\(1, 14rem\)/);
    assert.equal([...html.matchAll(/data-sesion=/g)].length, 1);
    assert.ok(html.includes('Incluye reserva'));
    const editando = renderToStaticMarkup(createElement(Calendario, { resultado: contexto, nivel: '3', editar: true, seleccionar() {} }));
    assert.match(editando, /data-reserva="90,87,84"[^>]*grid-column:2 \/ span 2;grid-row:2 \/ span 3/);
    assert.equal([...editando.matchAll(/data-sesion=/g)].length, 1);
    const sinClases = renderToStaticMarkup(createElement(Calendario, { resultado: { ...contexto, sesiones: [] }, nivel: '3', seleccionar() {} }));
    assert.equal([...sinClases.matchAll(/data-reserva=/g)].length, 3);
    assert.ok(!sinClases.includes('Incluye reserva'));
  } finally { await servidor.close(); }
});

test('S12-S13 carriles adaptativos conservados y auxiliar fijo de 6rem para 0 a 4 concurrencias', async () => {
  const { createServer } = await import('vite');
  const { createElement } = await import('react');
  const { renderToStaticMarkup } = await import('react-dom/server');
  const { readFile } = await import('node:fs/promises');
  const servidor = await createServer({ envFile: false, server: { middlewareMode: true }, appType: 'custom' });
  try {
    const { default: Calendario } = await servidor.ssrLoadModule('/src/features/resultados-horarios/CalendarioResultados.tsx');
    for (const cantidad of [0, 1, 2, 3, 4]) {
      const sesiones = Array.from({ length: cantidad }, (_, i) => ({ ...sesion, seccion: i + 1, idsHorarios: [i * 10 + 1, i * 10 + 2, i * 10 + 3, i * 10 + 4] }));
      const ancho = cantidad >= 2 ? 7 : 14;
      for (const editar of [false, true]) {
        const html = renderToStaticMarkup(createElement(Calendario, { resultado: { ...resultado, sesiones }, nivel: '3', editar, seleccionar() {} }));
        const carriles = Math.max(1, cantidad);
        assert.ok(html.includes(`grid-template-columns:7rem repeat(${carriles}, ${ancho}rem)${editar ? ' 6rem' : ''} repeat(1, 14rem)${editar ? ' 6rem' : ''}`));
        assert.equal([...html.matchAll(/data-sesion=/g)].length, cantidad);
        if (cantidad) {
          const conMovimiento = renderToStaticMarkup(createElement(Calendario, { resultado: { ...resultado, sesiones }, nivel: '3', editar: true, seleccionar() {},
            movimiento: { sesion: sesiones[0], idsHorarios: sesiones[0].idsHorarios.slice(0, 2), cantidad: 2, inicioId: 190, invalido: false, elegir() {} } }));
          assert.ok(conMovimiento.includes(`grid-template-columns:7rem repeat(${carriles}, ${ancho}rem) 6rem repeat(1, 14rem) 6rem`));
        }
      }
    }
    const css = await readFile(new URL('./calendario/Calendario.module.css', import.meta.url), 'utf8');
    for (const selector of ['destino', 'previa']) {
      const regla = css.match(new RegExp(`\\.${selector}\\s*\\{([^}]+)\\}`))?.[1];
      assert.match(regla, /width:\s*(?:calc\()?6rem/, selector);
    }
  } finally { await servidor.close(); }
});

test('S12 la vista previa usa un resumen por grupo sin repetir nombres largos en cada bloque', async () => {
  const { createServer } = await import('vite');
  const { createElement } = await import('react');
  const { renderToStaticMarkup } = await import('react-dom/server');
  const servidor = await createServer({ envFile: false, server: { middlewareMode: true }, appType: 'custom' });
  const larga = { ...sesion, asignatura: { ...sesion.asignatura, nombre: 'Introducción a la administración de sistemas distribuidos y redes de comunicaciones' } };
  try {
    const { default: Calendario } = await servidor.ssrLoadModule('/src/features/resultados-horarios/CalendarioResultados.tsx');
    const html = renderToStaticMarkup(createElement(Calendario, { resultado: { ...resultado, sesiones: [larga] }, nivel: '3', editar: true, seleccionar() {},
      movimiento: { sesion: larga, idsHorarios: [11, 12], cantidad: 2, inicioId: 190, invalido: false, elegir() {} } }));
    assert.equal([...html.matchAll(/data-resumen-previa=/g)].length, 1);
    assert.equal([...html.matchAll(/data-bloque-id=/g)].length, 2);
    assert.match(html, /data-resumen-previa="190"[^>]*grid-column:5;grid-row:2 \/ span 2/);
    const resumen = html.match(/<div[^>]*data-resumen-previa=[^>]*>(.*?)<\/div>/s)?.[1];
    assert.ok(resumen?.includes('2 bloques'));
    assert.ok(resumen?.includes('08:10'));
    assert.ok(resumen?.includes('Sin guardar'));
    assert.ok(!resumen?.includes(larga.asignatura.nombre));
  } finally { await servidor.close(); }
});

test('S13 destinos compactos conservan estados, razones exactas y distinción estructural de inicios', async () => {
  const { readFile } = await import('node:fs/promises');
  const contexto = { ...resultado, bloquesReservadosIds: [178], disponibilidades: resultado.disponibilidades.filter(d => d.bloqueId !== 181) };
  const original = JSON.stringify(contexto), elecciones = [];
  const propiedades = { resultado: contexto, nivel: '3', editar: true, seleccionar() {},
    movimiento: { sesion, idsHorarios: [11, 12], cantidad: 2, inicioId: 190, invalido: false, elegir: id => elecciones.push(id) } };
  const calendario = await montar('./CalendarioResultados.tsx', 'CalendarioResultados', propiedades, { entorno: {
    calendario: new Proxy({}, { get: (_, clave) => clave }), estilos: new Proxy({}, { get: (_, clave) => clave }),
    window: { addEventListener() {}, removeEventListener() {} },
  } });
  try {
    const destino = hora => calendario.buscar('button').find(b => b.props['aria-label']?.startsWith(`Martes ${hora}:`));
    for (const [hora, etiqueta, razon, deshabilitado, inicioEstado] of [
      ['08:10–08:50', 'Libre', 'libre con disponibilidad; destino de 2 bloques desde 08:10', false, true],
      ['08:50–09:30', 'Libre', 'libre con disponibilidad; destino de 2 bloques desde 08:10', false, false],
      ['09:40–10:20', 'Libre', 'libre con disponibilidad; destino de 2 bloques desde 09:40; falta disponibilidad para todo el grupo', true, false],
      ['10:20–11:00', 'No disponible', 'sin disponibilidad; destino de 2 bloques desde 09:40; falta disponibilidad para todo el grupo', true, true],
      ['11:10–11:50', 'Reservado', 'reservado; destino de 2 bloques desde 11:10; el grupo incluye una reserva', true, true],
      ['11:50–12:30', 'Libre', 'libre con disponibilidad; destino de 2 bloques desde 11:10; el grupo incluye una reserva', true, true],
    ]) {
      const boton = destino(hora);
      assert.equal(calendario.texto(boton), etiqueta);
      assert.equal(boton.props['aria-label'], `Martes ${hora}: ${razon}`);
      assert.equal(Boolean(boton.props.disabled), deshabilitado);
      assert.equal(boton.props['data-inicio-estado'], inicioEstado);
      boton.props.onClick({ detail: 0 });
    }
    const ocupado = calendario.buscar('button').find(b => b.props['aria-label']?.startsWith('Lunes 08:10–08:50: ocupado;'));
    assert.equal(calendario.texto(ocupado), 'Ocupado');
    assert.equal(ocupado.props.disabled, true);
    assert.deepEqual(elecciones, [190, 190]);
    assert.equal(JSON.stringify(contexto), original);
    for (const celda of calendario.buscar('div').filter(d => d.props['data-destino-id'])) {
      assert.doesNotMatch(celda.props.className, /disponible|sinDisponibilidad|destinoSeleccionado/);
    }
    assert.equal(calendario.buscar('p').some(p => calendario.texto(p).includes('El destino comienza en el bloque impar')), false);
    const css = await readFile(new URL('./calendario/Calendario.module.css', import.meta.url), 'utf8');
    assert.match(css, /\.destino:disabled\s*\{[^}]*border[^}]*dashed/);
    assert.match(css, /\.destino\[data-inicio-estado="false"\] span\s*\{[^}]*opacity:\s*0/);
    assert.match(css, /\.destino:hover span[^}]*opacity:\s*1/);
    assert.match(css, /\.destino:focus-visible span/);
  } finally { calendario.cerrar(); }
});

test('S13 anuncios montados sin caja vacía y resúmenes acotados sin cambiar las filas', async () => {
  const { readFile } = await import('node:fs/promises');
  const calendario = await montar('./CalendarioResultados.tsx', 'CalendarioResultados', { resultado, nivel: '3', editar: true, seleccionar() {} },
    { entorno: { calendario: new Proxy({}, { get: (_, clave) => clave }), window: { addEventListener() {}, removeEventListener() {} } } });
  try {
    const anuncio = calendario.buscar('div').find(d => d.props['aria-live'] === 'polite');
    assert.ok(anuncio);
    assert.equal(anuncio.props.className, 'anuncio');
    assert.equal(calendario.texto(anuncio), '');
    assert.equal(calendario.buscar('p').some(p => p.props.role === 'status'), false);
    assert.ok(calendario.buscar('p').some(p => calendario.texto(p).includes('Arrastra con el mouse, mantén presionado en pantalla táctil, o elige un destino')));
    const css = await readFile(new URL('./calendario/Calendario.module.css', import.meta.url), 'utf8');
    assert.match(css, /\.anuncio\s*\{[^}]*position:\s*absolute[^}]*clip-path:\s*inset\(50%\)/);
    assert.doesNotMatch(css.match(/\.anuncio\s*\{([^}]+)\}/)?.[1], /display:\s*none/);
    for (const selector of ['resumenPrevia', 'tarjetaArrastre']) {
      const regla = css.match(new RegExp(`\\.${selector}\\s*\\{([^}]+)\\}`))?.[1];
      assert.match(regla, /padding:\s*\.25rem/);
      assert.match(regla, /font-size:\s*\.8125rem/);
      assert.match(regla, /line-height:\s*1\.2/);
      assert.doesNotMatch(regla, /overflow:\s*hidden|line-clamp/);
    }
    assert.match(css, /\.calendario\[data-editando="true"\] \.clase:not\(:disabled\)[^}]*cursor:\s*grab/);
    assert.match(css, /\.calendario\[data-editando="true"\] \.clase\[data-arrastrando="true"\]:not\(:disabled\)[^}]*cursor:\s*grabbing/);
  } finally { calendario.cerrar(); }
});

test('S13 barra estable alinea acciones y mantiene la instrucción fuera de la franja', async () => {
  const { readFile } = await import('node:fs/promises');
  const pagina = await montar('./ResultadosHorariosPage.tsx', 'ContenidoResultados', { id: 2, ocupado: false, actualizarPlanificacion() {} }, {
    consultar: async () => resultado, entorno: { estilos: new Proxy({}, { get: (_, clave) => clave }) },
  });
  try {
    await pagina.asentar(); pagina.boton('3').props.onClick(); pagina.renderizar();
    const barra = () => pagina.buscar('div').find(d => d.props.className === 'barraHorario');
    assert.ok(barra());
    assert.deepEqual(pagina.buscar('button', barra()).map(pagina.texto), ['Actualizar horario', 'Editar horario']);
    pagina.boton('Editar horario').props.onClick(); pagina.renderizar();
    assert.deepEqual(pagina.buscar('button', barra()).map(pagina.texto), ['Actualizar horario', 'Cancelar edición']);
    assert.equal(pagina.buscar('p', barra()).length, 0);
    const ayuda = pagina.buscar('p').find(p => pagina.texto(p) === 'Elige una sesión para editar su horario.');
    assert.ok(ayuda); assert.equal(ayuda.props.role, undefined); assert.equal(ayuda.props['aria-live'], 'polite');
    const filtros = pagina.buscar('div').find(d => d.props['aria-label'] === 'Semestres de la malla');
    assert.equal(pagina.buscar('button', filtros).length, 10);
    pagina.componente('CalendarioResultados').props.seleccionar(sesion); pagina.renderizar();
    assert.deepEqual(pagina.buscar('button', barra()).map(pagina.texto), ['Actualizar horario', 'Cancelar edición']);
    pagina.boton('Cancelar edición').props.onClick(); pagina.renderizar();
    assert.equal(pagina.componente('CalendarioResultados').props.editar, false);
    assert.equal(pagina.componente('ControlesMovimiento'), undefined);
    const css = await readFile(new URL('./ResultadosHorarios.module.css', import.meta.url), 'utf8');
    assert.match(css, /\.barraHorario\s*\{[^}]*display:\s*flex[^}]*align-items:\s*center/);
  } finally { pagina.cerrar(); }
});

test('S3-S5 consulta abre cualquier detalle, edición explícita conserva una sesión y termina tras guardar', async () => {
  const externa = { ...sesion, idsHorarios: [31, 32], estadoSala: 'externa', editable: false };
  const otra = { ...sesion, idsHorarios: [21, 22], ofertaId: 6 };
  const llamadas = [];
  const pagina = await montar('./ResultadosHorariosPage.tsx', 'ContenidoResultados', { id: 2, ocupado: false, actualizarPlanificacion() {} }, {
    consultar: async () => ({ ...resultado, sesiones: [sesion, otra, externa] }),
    validarMovimiento: async (_id, datos) => { llamadas.push(['validar', datos]); return { valido: true, problemas: [] }; },
    mover: async (_id, datos) => { llamadas.push(['mover', datos]); return { ...resultado, revision: 'b'.repeat(64) }; },
  });
  try {
    await pagina.asentar(); pagina.boton('3').props.onClick(); pagina.renderizar();
    for (const actual of [sesion, externa]) {
      pagina.componente('CalendarioResultados').props.seleccionar(actual); pagina.renderizar();
      assert.equal(pagina.componente('DetalleSesionDialogo').props.sesion, actual);
      assert.equal(pagina.componente('ControlesMovimiento'), undefined);
      pagina.componente('DetalleSesionDialogo').props.cerrar(); pagina.renderizar();
    }
    pagina.boton('Editar horario').props.onClick(); pagina.renderizar();
    pagina.componente('CalendarioResultados').props.seleccionar(sesion); pagina.renderizar();
    assert.equal(pagina.componente('ControlesMovimiento').props.sesion.profesor.nombre, 'Docente');
    pagina.componente('CalendarioResultados').props.seleccionar(otra); pagina.renderizar();
    assert.equal(pagina.componente('ControlesMovimiento').props.sesion, sesion);
    pagina.componente('CalendarioResultados').props.movimiento.elegir(190); pagina.renderizar(); await pagina.asentar();
    assert.deepEqual(llamadas.map(l => l[0]), ['validar']);
    pagina.componente('ControlesMovimiento').props.confirmar(); await pagina.asentar();
    assert.deepEqual(llamadas.map(l => l[0]), ['validar', 'mover']);
    assert.equal(pagina.componente('CalendarioResultados').props.editar, false);
    assert.equal(pagina.componente('ControlesMovimiento'), undefined);
    assert.equal(pagina.boton('Editar horario').props.disabled, false);
  } finally { pagina.cerrar(); }
});

test('S5 disponibilidad ausente bloquea editar y disponibilidad vacía es un resultado cargado', async () => {
  for (const disponibilidades of [undefined, []]) {
    const pagina = await montar('./ResultadosHorariosPage.tsx', 'ContenidoResultados', { id: 2, ocupado: false, actualizarPlanificacion() {} }, {
      consultar: async () => ({ ...resultado, disponibilidades }),
    });
    try {
      await pagina.asentar();
      assert.equal(pagina.boton('Editar horario').props.disabled, disponibilidades === undefined);
      if (disponibilidades) {
        pagina.componente('GestionSalas').props.seleccionar(sesion); pagina.renderizar();
        assert.equal(pagina.componente('ControlesMovimiento').props.resultado.disponibilidades.length, 0);
        assert.equal(pagina.componente('CalendarioResultados').props.movimiento.inicioId, 0);
      }
    } finally { pagina.cerrar(); }
  }
});

test('S3 el detalle conserva datos completos, salas por tramo y cierre sin peticiones', async () => {
  const actual = { ...sesion, salas: [{ id: 1, nombre: 'A101' }, { id: 1, nombre: 'A101' }, null, null] };
  let cierres = 0;
  const detalle = await montar('./DetalleSesionDialogo.tsx', 'DetalleSesionDialogo', { resultado, sesion: actual, cerrar: () => { cierres++; } }, {});
  try {
    assert.equal(detalle.componente('Dialogo').props.titulo, 'Detalle de la sesión');
    assert.equal(detalle.componente('Dialogo').props.tamano, 'detalle');
    const texto = detalle.texto(detalle.componente('Dialogo'));
    for (const dato of ['100 — Estructuras de Datos', 'Docente', 'Sección1', 'Teórica', 'Lunes', '08:10–11:00', '08:10–09:30: A101', '09:40–11:00: Sin sala']) assert.ok(texto.includes(dato), dato);
    detalle.componente('Dialogo').props.cerrar(); assert.equal(cierres, 1);
  } finally { detalle.cerrar(); }
});

test('S6 clic y teclado eligen destinos existentes sin guardar ni seleccionar otras clases', async () => {
  const elecciones = []; const selecciones = []; let reloj; const eventos = new Map();
  const contexto = { ...resultado, bloques: resultado.bloques.filter(b => b.id !== 175) };
  const propiedades = { resultado: contexto, nivel: '3', editar: true, seleccionar: s => selecciones.push(s),
    movimiento: { sesion, idsHorarios: [11, 12], cantidad: 2, inicioId: 0, invalido: false, elegir: id => elecciones.push(id) } };
  const calendario = await montar('./CalendarioResultados.tsx', 'CalendarioResultados', propiedades, { entorno: {
    window: { addEventListener: (tipo, fn) => eventos.set(tipo, fn), removeEventListener() {} }, document: { elementsFromPoint: () => [] },
    setTimeout: fn => { reloj = fn; return 1; }, clearTimeout: () => { reloj = null; },
  } });
  try {
    const destino = calendario.buscar('button').find(b => b.props['aria-label']?.startsWith('Martes 08:10'));
    assert.equal(destino.props.disabled, false); destino.props.onClick({ detail: 0 });
    assert.deepEqual(elecciones, [190]); assert.deepEqual(selecciones, []);
    const hueco = calendario.buscar('div').find(d => d.props.children?.props?.children === 'Sin bloque');
    assert.ok(hueco); assert.equal(hueco.props['data-destino-id'], undefined); assert.equal(calendario.buscar('button', hueco).length, 0);
    calendario.buscar('button').find(b => b.props['data-sesion']).props.onPointerDown({ pointerId: 1, button: 0, isPrimary: true, clientX: 0, clientY: 0,
      currentTarget: { setPointerCapture() {}, hasPointerCapture: () => true, releasePointerCapture() {} } });
    reloj(); eventos.get('keydown')({ key: 'Escape' });
    destino.props.onClick({ detail: 0 });
    assert.deepEqual(elecciones, [190, 190], 'Escape no debe consumir el siguiente clic de teclado.');
    propiedades.ocupado = true; calendario.renderizar();
    calendario.buscar('button').find(b => b.props['aria-label']?.startsWith('Martes 08:10')).props.onClick({ detail: 0 });
    assert.deepEqual(elecciones, [190, 190]);
  } finally { calendario.cerrar(); }
});

test('only secretary/admin manage results and only a current proposal is mutable', async () => {
  const m = await import('./modelo.ts');
  for (const rol of ['secretaria', 'admin']) assert.equal(m.puedeGestionarResultados(rol), true);
  for (const rol of ['profesor', undefined, null]) assert.equal(m.puedeGestionarResultados(rol), false);
  assert.equal(m.puedeEditarResultado(resultado), true);
  for (const cambio of [{ actual: false }, { estadoPlanificacion: 'publicado' }, { estadoPlanificacion: 'preparacion' }]) {
    assert.equal(m.puedeEditarResultado({ ...resultado, planificacion: { ...resultado.planificacion, ...cambio } }), false);
  }
});

test('S6 el CSS reserva el gesto antes del contacto solo en tarjetas habilitadas durante edición', async () => {
  const { readFile } = await import('node:fs/promises');
  const css = await readFile(new URL('./calendario/Calendario.module.css', import.meta.url), 'utf8');
  const reglasTactiles = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .filter(([, , cuerpo]) => /touch-action\s*:/.test(cuerpo))
    .map(([, selector, cuerpo]) => [selector.trim(), cuerpo.match(/touch-action\s*:\s*([^;]+)/)[1].trim()]);
  assert.deepEqual(reglasTactiles, [
    ['.clase', 'pan-x pan-y'],
    ['.calendario[data-editando="true"] .clase:not(:disabled)', 'none'],
  ]);
  assert.match(css, /\.desplazamiento\s*\{[^}]*overflow:\s*auto\s*;/);
});

test('S6 consulta conserva tarjetas accesibles y edición deshabilita las que no admiten movimiento', async () => {
  const propiedades = { resultado: { ...resultado, sesiones: [sesion, { ...sesion, idsHorarios: [21, 22], editable: false }] }, nivel: '3', seleccionar() {}, editar: false, ocupado: false };
  const calendario = await montar('./CalendarioResultados.tsx', 'CalendarioResultados', propiedades, {
    entorno: { window: { addEventListener() {}, removeEventListener() {} } },
  });
    const tarjetas = () => calendario.buscar('button').filter(b => b.props['data-sesion']);
  try {
    assert.equal(calendario.buscar('div').find(d => d.props['aria-label'] === 'Horario semanal').props['data-editando'], false);
      assert.deepEqual(tarjetas().map(b => Boolean(b.props.disabled)), [false, false]);
      assert.ok(tarjetas().every(b => b.props['data-arrastrando'] === false));
    propiedades.editar = true; calendario.renderizar();
    assert.equal(calendario.buscar('div').find(d => d.props['aria-label'] === 'Horario semanal').props['data-editando'], true);
    assert.deepEqual(tarjetas().map(b => Boolean(b.props.disabled)), [false, true]);
    propiedades.ocupado = true; calendario.renderizar();
    assert.deepEqual(tarjetas().map(b => Boolean(b.props.disabled)), [true, true]);
  } finally { calendario.cerrar(); }
});

test('S6 manejadores reales preparan selección antes del long press, drop solo elige y cancelaciones conservan preview', async () => {
  let reloj; const eventos = new Map(); const elecciones = []; const selecciones = []; let capturas = 0;
  const ventana = { addEventListener: (tipo, fn) => eventos.set(tipo, fn), removeEventListener: tipo => eventos.delete(tipo) };
  const propiedades = { resultado, nivel: '3', editar: true, seleccionar: actual => selecciones.push(actual) };
  const calendario = await montar('./CalendarioResultados.tsx', 'CalendarioResultados', propiedades, { entorno: {
    window: ventana, document: { elementsFromPoint: () => [{ closest: () => ({ dataset: { destinoId: '190' } }) }] },
    setTimeout: function (fn) { assert.ok(this === globalThis, 'El temporizador del navegador necesita su receptor global.'); reloj = fn; return 1; },
    clearTimeout: function () { assert.ok(this === globalThis, 'La cancelación del temporizador necesita su receptor global.'); reloj = null; },
  } });
  const evento = (cambios = {}) => ({ pointerId: 1, button: 0, isPrimary: true, clientX: 20, clientY: 80,
    currentTarget: { setPointerCapture() { capturas++; }, hasPointerCapture: () => true, releasePointerCapture() { capturas--; } }, preventDefault() {}, ...cambios });
  const tarjeta = () => calendario.buscar('button').find(b => b.props['data-sesion']);
  const preparar = () => {
    tarjeta().props.onPointerDown(evento()); calendario.renderizar();
    propiedades.movimiento = { sesion, idsHorarios: [13, 14], cantidad: 2, inicioId: 184, invalido: false, elegir: id => elecciones.push(id) };
    calendario.renderizar();
  };
  try {
    assert.equal(typeof tarjeta()?.props.onPointerDown, 'function');
    preparar(); assert.deepEqual(selecciones, [sesion]); assert.equal(capturas, 0);
    reloj(); calendario.renderizar(); assert.equal(capturas, 1);
    eventos.get('pointermove')(evento({ clientX: 500, clientY: 900 }));
    eventos.get('pointerup')(evento({ clientX: 500, clientY: 900 })); calendario.renderizar();
    assert.deepEqual(elecciones, [190]); assert.equal(capturas, 0);
    tarjeta().props.onClick({ detail: 1 }); assert.equal(selecciones.length, 1, 'El click sintético del drag no vuelve a seleccionar.');
    for (const cancelar of ['pointercancel', 'lostpointercapture', 'scroll', 'Escape', 'unmount']) {
      preparar(); reloj(); calendario.renderizar();
      if (cancelar === 'Escape') eventos.get('keydown')({ key: 'Escape', preventDefault() {} });
      else if (cancelar === 'lostpointercapture') tarjeta().props.onLostPointerCapture(evento());
      else if (cancelar === 'unmount') calendario.cerrar();
      else eventos.get(cancelar)(evento());
      assert.equal(capturas, 0); assert.deepEqual(elecciones, [190]);
      if (cancelar !== 'unmount') {
        calendario.renderizar();
        assert.equal(calendario.buscar('div').some(d => d.props['data-grupo-arrastrado']), false);
      }
    }
  } finally { calendario.cerrar(); }
});

test('S15 el mouse inicia al arrastrar, el touch conserva la pulsación y el scroll del usuario cancela', async () => {
  const eventos = new Map(), documento = { elementsFromPoint: () => [{ closest: () => ({ dataset: { destinoId: '187' } }) }] };
  const elecciones = []; let reloj, capturas = 0;
  const propiedades = { resultado, nivel: '3', editar: true, seleccionar() {},
    movimiento: { sesion, idsHorarios: [11, 12], cantidad: 2, inicioId: 0, invalido: false, elegir: id => elecciones.push(id) } };
  const calendario = await montar('./CalendarioResultados.tsx', 'CalendarioResultados', propiedades, { entorno: {
    window: { addEventListener: (tipo, fn) => eventos.set(tipo, fn), removeEventListener() {} }, document: documento,
    setTimeout: fn => { reloj = fn; return 1; }, clearTimeout: () => { reloj = null; },
  } });
  const puntero = { pointerId: 1, pointerType: 'mouse', button: 0, isPrimary: true, clientX: 0, clientY: 0, preventDefault() {},
    currentTarget: { setPointerCapture() { capturas++; }, hasPointerCapture: () => capturas > 0, releasePointerCapture() { capturas--; } } };
  const iniciar = cambios => calendario.buscar('button').find(b => b.props['data-sesion']).props.onPointerDown({ ...puntero, ...cambios });
  try {
    iniciar(); eventos.get('scroll')({ target: documento }); // Reflujo observado al seleccionar, sin acción de scroll.
    eventos.get('pointermove')({ ...puntero, clientX: 18 });
    assert.equal(capturas, 1, 'Arrastrar con mouse no exige esperar el temporizador.');
    eventos.get('pointerup')(puntero); assert.deepEqual(elecciones, [190]);
    iniciar({ pointerType: 'touch' });
    eventos.get('pointermove')({ ...puntero, pointerType: 'touch', clientX: 18 });
    assert.equal(reloj, null); assert.equal(capturas, 0);
    iniciar({ pointerType: 'touch' }); eventos.get('scroll')({ target: documento });
    reloj(); assert.equal(capturas, 1, 'La selección no cancela la primera pulsación táctil.');
    eventos.get('scroll')({ target: documento }); assert.equal(capturas, 0, 'Un scroll durante el arrastre activo sí cancela.');
    for (const tipo of ['wheel', 'keydown']) {
      iniciar(); eventos.get(tipo)({ key: 'PageDown' });
      assert.equal(reloj, null); assert.equal(capturas, 0);
    }
    iniciar(); eventos.get('scroll')({ target: {} });
    assert.equal(reloj, null, 'El scroll interno cancela incluso antes de activar.');
    assert.deepEqual(elecciones, [190]);
  } finally { calendario.cerrar(); }
});

test('S6 desplazamiento previo y disponibilidad sin preparar abortan el gesto inicial', async () => {
  let reloj; const eventos = new Map(); let destinos = 0;
  const propiedades = { resultado, nivel: '3', editar: true, seleccionar() {} };
  const calendario = await montar('./CalendarioResultados.tsx', 'CalendarioResultados', propiedades, { entorno: {
    window: { addEventListener: (tipo, fn) => eventos.set(tipo, fn), removeEventListener() {} },
    document: { elementsFromPoint: () => [] }, setTimeout: fn => { reloj = fn; return 1; }, clearTimeout: () => { reloj = null; },
  } });
  const evento = { pointerId: 1, button: 0, isPrimary: true, clientX: 0, clientY: 0, currentTarget: { setPointerCapture() { assert.fail('No debe capturar'); } } };
  try {
    const tarjeta = calendario.buscar('button').find(b => b.props['data-sesion']);
    tarjeta.props.onPointerDown(evento);
    eventos.get('pointermove')({ ...evento, clientY: 20 }); assert.equal(reloj, null);
    tarjeta.props.onPointerDown(evento); reloj();
    eventos.get('pointerup')(evento); assert.equal(destinos, 0);
  } finally { calendario.cerrar(); }
});

for (const caso of [
  { nombre: 'sesión editable', externa: false },
  { nombre: 'sesión externa no movible', externa: true },
  { nombre: 'botón secundario previo', previo: { button: 2, isPrimary: true } },
  { nombre: 'botón auxiliar previo', previo: { button: 1, isPrimary: true } },
  { nombre: 'contacto táctil no primario previo', previo: { button: 0, isPrimary: false } },
]) test(`S3-S4-S13 el primer clic de consulta abre tras guardar un arrastre sin clic sintético: ${caso.nombre}`, async () => {
  const externa = { ...sesion, idsHorarios: [31, 32], editable: false, estadoSala: 'externa' };
  const contexto = { ...resultado, sesiones: [sesion, externa] };
  const original = JSON.stringify(contexto), consultas = [], destinos = [], eventos = new Map();
  let reloj, capturas = 0, temporizadores = 0;
  const propiedades = { resultado: contexto, nivel: '3', editar: true, seleccionar: actual => consultas.push(actual),
    movimiento: { sesion, idsHorarios: [11, 12], cantidad: 2, inicioId: 0, invalido: false, elegir: id => destinos.push(id) } };
  const calendario = await montar('./CalendarioResultados.tsx', 'CalendarioResultados', propiedades, { entorno: {
    window: { addEventListener: (tipo, fn) => eventos.set(tipo, fn), removeEventListener() {} },
    document: { elementsFromPoint: () => [{ closest: () => ({ dataset: { destinoId: '190' } }) }] },
    setTimeout: fn => { reloj = fn; temporizadores++; return 1; }, clearTimeout() {},
  } });
  const puntero = { pointerId: 1, button: 0, isPrimary: true, clientX: 10, clientY: 20,
    currentTarget: { setPointerCapture() { capturas++; }, hasPointerCapture: () => true, releasePointerCapture() { capturas--; } } };
  const tarjetas = () => calendario.buscar('button').filter(b => b.props['data-sesion']);
  try {
    tarjetas()[0].props.onPointerDown(puntero); reloj(); calendario.renderizar();
    assert.equal(capturas, 1);
    eventos.get('pointerup')(puntero); calendario.renderizar();
    assert.equal(capturas, 0); assert.deepEqual(destinos, [190]); assert.deepEqual(consultas, []);
    // Simula el retorno exitoso a consulta, sin emitir el clic sintético del arrastre.
    propiedades.editar = false; propiedades.movimiento = undefined;
    propiedades.resultado = { ...contexto, revision: 'b'.repeat(64) }; calendario.renderizar();
    const tarjeta = tarjetas()[caso.externa ? 1 : 0];
    assert.equal(Boolean(tarjeta.props.disabled), false);
    assert.equal(tarjeta.props['aria-haspopup'], 'dialog');
    if (caso.previo) {
      tarjeta.props.onPointerDown({ ...puntero, ...caso.previo });
      tarjeta.props.onClick({ detail: 1 });
      assert.deepEqual(consultas, [], 'Un contacto no primario o un botón distinto de cero no debe limpiar la supresión pendiente.');
    }
    tarjeta.props.onPointerDown(puntero); tarjeta.props.onClick({ detail: 1 });
    assert.deepEqual(consultas, [caso.externa ? externa : sesion]);
    assert.deepEqual(destinos, [190]); assert.equal(capturas, 0); assert.equal(temporizadores, 1);
    assert.equal(JSON.stringify(contexto), original);
  } finally { calendario.cerrar(); }
});

test('S6 integración de long press inicial y grupo parcial valida al soltar pero solo confirma una escritura', async () => {
  const validaciones = []; const escrituras = []; let reloj; const eventos = new Map(); let bloqueBajoPuntero = '190';
  const original = JSON.stringify(resultado);
  const pagina = await montar('./ResultadosHorariosPage.tsx', 'ContenidoResultados', { id: 2, ocupado: false, actualizarPlanificacion() {} }, {
    consultar: async () => resultado,
    validarMovimiento: async (_id, datos) => { validaciones.push(datos); return { valido: true, problemas: [] }; },
    mover: async (_id, datos) => { escrituras.push(datos); return { ...resultado, revision: 'c'.repeat(64) }; },
  });
  let calendario;
  try {
    await pagina.asentar(); pagina.boton('3').props.onClick(); pagina.renderizar();
    pagina.boton('Editar horario').props.onClick(); pagina.renderizar();
    const propiedades = { ...pagina.componente('CalendarioResultados').props };
    calendario = await montar('./CalendarioResultados.tsx', 'CalendarioResultados', propiedades, { entorno: {
      window: { addEventListener: (tipo, fn) => eventos.set(tipo, fn), removeEventListener() {} },
      document: { elementsFromPoint: () => [{ closest: () => ({ dataset: { destinoId: bloqueBajoPuntero } }) }] },
      setTimeout: fn => { reloj = fn; return 1; }, clearTimeout: () => { reloj = null; },
    } });
    const sincronizar = () => { pagina.renderizar(); Object.assign(propiedades, pagina.componente('CalendarioResultados').props); calendario.renderizar(); };
    const puntero = { pointerId: 8, button: 0, isPrimary: true, clientX: 5, clientY: 800,
      currentTarget: { setPointerCapture() {}, hasPointerCapture: () => true, releasePointerCapture() {} } };
    const iniciar = () => calendario.buscar('button').find(b => b.props['data-sesion']).props.onPointerDown(puntero);
    const columnasIniciales = calendario.buscar('div').find(d => d.props['aria-label'] === 'Horario semanal').props.style.gridTemplateColumns;
    iniciar(); sincronizar();
    assert.equal(calendario.buscar('div').find(d => d.props['aria-label'] === 'Horario semanal').props.style.gridTemplateColumns, columnasIniciales,
      'Preparar la disponibilidad no debe mover la tarjeta bajo el puntero.');
    assert.equal(pagina.componente('ControlesMovimiento').props.sesion, sesion);
    assert.ok(calendario.buscar('p').some(p => calendario.texto(p).includes('Disponibilidad de Docente')));
    assert.deepEqual(validaciones, []); reloj(); calendario.renderizar();
    const guia = () => calendario.buscar('div').find(d => d.props['data-grupo-arrastrado']);
    assert.ok(guia()); assert.equal(calendario.texto(guia()), '4 bloques08:10VálidoSin guardar');
    assert.match(guia().props['aria-label'], /Sesión completa.*4 bloques.*08:10–11:00/);
    assert.equal(calendario.buscar('button').find(b => b.props['data-sesion']).props['data-arrastrando'], true);
    assert.equal(calendario.texto(calendario.buscar('div').find(d => d.props['aria-live'] === 'polite')),
      'Arrastrando el grupo seleccionado. Suelta sobre el inicio del destino para previsualizar.');
    assert.equal(calendario.buscar('div').find(d => d.props['aria-label'] === 'Horario semanal').props.style.gridTemplateColumns, columnasIniciales);
    assert.equal(guia().props['data-destino-valido'], true);
    for (const bloque of ['175', '187', '184', '190']) {
      bloqueBajoPuntero = bloque;
      eventos.get('pointermove')({ ...puntero, clientX: Number(bloque), clientY: 400, preventDefault() {} }); calendario.renderizar(); pagina.renderizar();
      assert.equal(guia().props['data-destino-valido'], bloque !== '175');
      assert.equal(guia().props['data-destino-arrastre'], bloque === '187' ? 190 : bloque === '175' ? 178 : Number(bloque));
      assert.match(calendario.texto(guia()), bloque === '175' ? /No válido/ : /Válido/);
      assert.deepEqual(validaciones, []); assert.deepEqual(escrituras, []);
      assert.equal(pagina.componente('ControlesMovimiento').props.datos.bloqueInicioId, 0);
    }
    eventos.get('pointerup')(puntero); sincronizar(); await pagina.asentar();
    assert.equal(guia(), undefined);
    assert.equal(calendario.buscar('button').find(b => b.props['data-sesion']).props['data-arrastrando'], false);
    assert.equal(calendario.texto(calendario.buscar('div').find(d => d.props['aria-live'] === 'polite')), '');
    assert.equal(calendario.buscar('p').some(p => calendario.texto(p).includes('Arrastre terminado.')), false);
    assert.deepEqual(validaciones, [{ revision: resultado.revision, idsHorarios: [11, 12, 13, 14], bloqueInicioId: 190 }]);
    assert.deepEqual(escrituras, []); assert.equal(JSON.stringify(resultado), original);
    pagina.componente('ControlesMovimiento').props.cambiarGrupo(2); sincronizar();
    iniciar(); reloj(); calendario.renderizar();
    assert.equal(calendario.texto(guia()), '2 bloques08:10VálidoSin guardar');
    assert.match(guia().props['aria-label'], /Grupo parcial.*2 bloques.*09:40–11:00/);
    assert.match(guia().props.style.gridRow, /span 2/);
    eventos.get('keydown')({ key: 'Escape' }); calendario.renderizar();
    assert.equal(guia(), undefined); assert.equal(validaciones.length, 1);
    iniciar(); reloj(); eventos.get('pointerup')(puntero); sincronizar(); await pagina.asentar();
    assert.deepEqual(validaciones.at(-1), { revision: resultado.revision, idsHorarios: [13, 14], bloqueInicioId: 190 });
    assert.deepEqual(escrituras, []);
    pagina.componente('ControlesMovimiento').props.confirmar(); await pagina.asentar();
    assert.deepEqual(escrituras, [validaciones.at(-1)]);
    assert.equal(pagina.componente('CalendarioResultados').props.editar, false);
    assert.equal(JSON.stringify(resultado), original);
  } finally { calendario?.cerrar(); pagina.cerrar(); }
});

test('room-assigned and external sessions are green read-only and cannot confirm movement', async () => {
  const m = await import('./modelo.ts');
  const datos = { revision: resultado.revision, idsHorarios: [11, 12], bloqueInicioId: 190 };
  const validacion = { clave: m.claveMovimiento(2, datos), valido: true, problemas: [] };
  assert.equal(m.etiquetasSala.externa, 'Horario externo');
  assert.equal(m.puedeMoverSesion(resultado, sesion), true);
  for (const cambios of [{ estadoSala: 'externa' }, { estadoSala: 'asignada' }, { estadoSala: 'laboratorio' },
    { salas: [{ id: 1, nombre: 'A-101' }, null, null, null] }]) {
    const protegida = { ...sesion, ...cambios };
    assert.equal(m.esSesionLista(protegida), true);
    assert.equal(m.puedeMoverSesion(resultado, protegida), false);
    assert.equal(m.puedeConfirmarMovimiento(resultado, protegida, datos, validacion), false);
  }
});

test('laboratories are ready, noneditable and labeled only Laboratorio', async () => {
  const m = await import('./modelo.ts');
  const laboratorio = { ...sesion, estadoSala: 'laboratorio', tipoHora: { id: 3, tipo: 'Laboratorio' } };
  assert.equal(m.etiquetasSala.laboratorio, 'Laboratorio');
  assert.equal(m.esSesionLista(laboratorio), true);
  assert.equal(m.puedeMoverSesion(resultado, laboratorio), false);
  assert.equal(m.puedeConfirmarMovimiento(resultado, laboratorio, { revision: resultado.revision, idsHorarios: [11, 12], bloqueInicioId: 190 }, null), false);
});

test('S15 el anclaje usa la pareja del día por número institucional, nunca por ID ni duración redondeada', async () => {
  const m = await import('./modelo.ts');
  for (const cantidad of [2, 3, 4]) {
    for (const id of [190, 187]) {
      const inicio = m.inicioParejaDestino(resultado.bloques, id);
      assert.equal(inicio?.id, 190);
      assert.equal(m.bloquesDestino(resultado.bloques, inicio.id, cantidad).length, cantidad);
    }
  }
  assert.equal(m.inicioParejaDestino(resultado.bloques, 181)?.id, 184);
  assert.equal(m.inicioParejaDestino(resultado.bloques, 999), undefined);
  assert.equal(m.inicioParejaDestino(resultado.bloques.filter(b => b.id !== 190), 187), undefined);
});

for (const cantidad of [2, 3, 4]) test(`S15 clic, teclado y drop sobre ambas mitades conservan ${cantidad} bloques`, async () => {
  const elecciones = [], eventos = new Map(); let reloj, apuntado = '187';
  const propiedades = { resultado, nivel: '3', editar: true, seleccionar() {},
    movimiento: { sesion, idsHorarios: sesion.idsHorarios.slice(0, cantidad), cantidad, inicioId: 0, invalido: false, elegir: id => elecciones.push(id) } };
  const calendario = await montar('./CalendarioResultados.tsx', 'CalendarioResultados', propiedades, { entorno: {
    window: { addEventListener: (tipo, fn) => eventos.set(tipo, fn), removeEventListener() {} },
    document: { elementsFromPoint: () => [{ closest: () => ({ dataset: { destinoId: apuntado } }) }] },
    setTimeout: fn => { reloj = fn; return 1; }, clearTimeout() {},
  } });
  const puntero = { pointerId: 1, button: 0, isPrimary: true, clientX: 5, clientY: 5,
    currentTarget: { setPointerCapture() {}, hasPointerCapture: () => true, releasePointerCapture() {} } };
  const boton = numero => calendario.buscar('button').find(b => b.props['aria-label']?.startsWith(`Martes ${numero === 1 ? '08:10' : '08:50'}`));
  try {
    for (const numero of [1, 2]) {
      assert.equal(boton(numero).props.disabled, false);
      boton(numero).props.onClick({ detail: 0 });
      boton(numero).props.onClick({ detail: 1 });
      apuntado = numero === 1 ? '190' : '187';
      calendario.buscar('button').find(b => b.props['data-sesion']).props.onPointerDown(puntero);
      reloj(); eventos.get('pointerup')(puntero); calendario.renderizar();
      // El clic posterior a soltar no vuelve a elegir, el siguiente contacto es explícito.
      boton(numero).props.onClick({ detail: 1 });
    }
    assert.deepEqual(elecciones, Array(6).fill(190));
    for (const contexto of [
      { ...resultado, bloquesReservadosIds: [187] },
      { ...resultado, disponibilidades: resultado.disponibilidades.filter(d => d.bloqueId !== 190) },
      { ...resultado, bloques: resultado.bloques.filter(b => b.id !== 190) },
    ]) {
      propiedades.resultado = contexto; calendario.renderizar();
      assert.equal(boton(2).props.disabled, true);
    }
    propiedades.resultado = resultado; calendario.renderizar();
    const ultimo = calendario.buscar('button').find(b => b.props['aria-label']?.startsWith('Martes 11:50'));
    assert.equal(ultimo.props.disabled, cantidad !== 2, 'No se retrocede otra pareja para hacer caber el grupo.');
  } finally { calendario.cerrar(); }
});

test('movement targets are green only when the full group is free and available', async () => {
  const m = await import('./modelo.ts');
  assert.equal(m.estadoDestino(resultado, sesion, 190, 2), 'disponible');
  assert.equal(m.estadoDestino(resultado, sesion, 84, 2), 'ocupado');
  assert.equal(m.estadoDestino({ ...resultado, disponibilidades: [] }, sesion, 190, 2), 'sinDisponibilidad');
  assert.equal(m.estadoDestino(resultado, sesion, 178, 3), 'fueraDeRango');
  const mismaMalla = { ...sesion, idsHorarios: [31, 32], profesorId: 99, bloquesIds: [187, 184] };
  assert.equal(m.estadoDestino({ ...resultado, sesiones: [sesion, mismaMalla] }, sesion, 190, 2), 'ocupado');
  const otroNivel = { ...mismaMalla, asignatura: { ...sesion.asignatura, semestreMalla: 5 } };
  assert.equal(m.estadoDestino({ ...resultado, sesiones: [sesion, otroNivel] }, sesion, 190, 2), 'disponible');
  assert.equal(m.estadoDestino({ ...resultado, sesiones: [sesion, { ...otroNivel, profesorId: sesion.profesorId }] }, sesion, 190, 2), 'ocupado');
  const datos = { revision: resultado.revision, idsHorarios: [11, 12], bloqueInicioId: 84 };
  assert.equal(m.puedeConfirmarMovimiento(resultado, sesion, datos, { clave: m.claveMovimiento(2, datos), valido: true, problemas: [] }), false);
});

test('las reservas impiden destinos completos y parciales sin bloquear otra carrera', async () => {
  const m = await import('./modelo.ts');
  for (const reserva of [190, 187]) {
    const reservado = { ...resultado, bloquesReservadosIds: [reserva] };
    const datos = { revision: resultado.revision, idsHorarios: [11, 12], bloqueInicioId: 190 };
    assert.equal(m.estadoCasilla(reservado, sesion, reserva), 'reservado');
    assert.equal(m.estadoDestino(reservado, sesion, 190, 2), 'reservado');
    assert.equal(m.destinoDisponible(reservado, sesion, 190, 2), false);
    assert.equal(m.puedeConfirmarMovimiento(reservado, sesion, datos, {
      clave: m.claveMovimiento(2, datos), valido: true, problemas: [],
    }), false);
  }
  assert.equal(m.estadoDestino({ ...resultado, bloquesReservadosIds: [] }, sesion, 190, 2), 'disponible');
  assert.equal(m.destinoDisponible(resultado, sesion, 190, 2), true);
});

test('whole session is first and groups never leave isolated or nonconsecutive blocks', async () => {
  const { gruposMovibles } = await import('./modelo.ts');
  assert.deepEqual(gruposMovibles(sesion, bloques), [[11, 12, 13, 14], [11, 12], [13, 14]]);
  for (const longitud of [2, 3]) assert.deepEqual(gruposMovibles({ ...sesion, idsHorarios: sesion.idsHorarios.slice(0, longitud) }, bloques), [sesion.idsHorarios.slice(0, longitud)]);
  assert.deepEqual(gruposMovibles({ ...sesion, editable: false }, bloques), []);
});

test('destinations use block chronology, full duration and declared planning-specific availability', async () => {
  const { bloquesDestino, destinoDisponible } = await import('./modelo.ts');
  assert.deepEqual(bloquesDestino(bloques, 84, 2).map(b => b.id), [84, 81]);
  assert.deepEqual(bloquesDestino(bloques, 75, 2), []);
  assert.equal(destinoDisponible(resultado, sesion, 84, 2), true);
  assert.equal(destinoDisponible({ ...resultado, disponibilidades: resultado.disponibilidades.slice(0, 3) }, sesion, 84, 2), false);
  assert.equal(destinoDisponible({ ...resultado, disponibilidades: resultado.disponibilidades.map(d => ({ ...d, planificacionSemestreId: 7 })) }, sesion, 84, 2), false);
});

test('movement confirmation requires the exact revision, group and destination and backend validation', async () => {
  const m = await import('./modelo.ts');
  const datos = { revision: resultado.revision, idsHorarios: [11, 12], bloqueInicioId: 190 };
  const validacion = { clave: m.claveMovimiento(2, datos), valido: true, problemas: [] };
  assert.equal(m.puedeConfirmarMovimiento(resultado, sesion, datos, validacion), true);
  for (const cambio of [{ revision: 'b'.repeat(64) }, { idsHorarios: [13, 14] }, { bloqueInicioId: 81 }]) {
    assert.equal(m.puedeConfirmarMovimiento(resultado, sesion, { ...datos, ...cambio }, validacion), false);
  }
  assert.equal(m.puedeConfirmarMovimiento(resultado, sesion, datos, { ...validacion, valido: false }), false);
  assert.equal(m.puedeConfirmarMovimiento(resultado, sesion, datos, null), false);
  assert.equal(m.puedeConfirmarMovimiento(resultado, { ...sesion, editable: false }, datos, validacion), false);
});

test('level filtering never hides planning-wide pending counts or discards fixed sessions', async () => {
  const m = await import('./modelo.ts');
  const completa = { ...resultado, sesiones: [sesion, { ...sesion, ofertaId: 6, editable: false, estadoSala: 'externa', asignatura: { ...sesion.asignatura, semestreMalla: 5 } }] };
  assert.deepEqual(m.sesionesVisibles(completa, '5').map(s => s.estadoSala), ['externa']);
  assert.equal(completa.pendientesSala, 1);
  assert.equal(m.sesionesVisibles(completa, '').length, 2);
});

test('read lifecycle rejects obsolete same-plan replies and clears old data before reload', async () => {
  const m = await import('./modelo.ts');
  let estado = m.reducirResultados(m.estadoInicial, { tipo: 'seleccionar', id: 2 });
  const anterior = estado.secuencia;
  estado = m.reducirResultados(estado, { tipo: 'cargado', secuencia: anterior, resultado });
  assert.equal(estado.resultado, resultado);
  estado = m.reducirResultados(estado, { tipo: 'seleccionar', id: 7 });
  estado = m.reducirResultados(estado, { tipo: 'seleccionar', id: 2 });
  assert.equal(estado.resultado, null);
  assert.equal(m.reducirResultados(estado, { tipo: 'cargado', secuencia: anterior, resultado }), estado);
  assert.equal(m.reducirResultados(estado, { tipo: 'fallo', secuencia: anterior, mensaje: 'Old' }), estado);
  assert.equal(m.reducirResultados(estado, { tipo: 'cargado', secuencia: estado.secuencia, resultado: { ...resultado, planificacion: { ...resultado.planificacion, id: 7 } } }), estado);
});

test('publication confirmation is revision-bound and forbidden after publication', async () => {
  const { puedePublicar } = await import('./modelo.ts');
  const valida = { valido: true, problemas: [], revision: resultado.revision };
  assert.equal(puedePublicar(resultado, valida), true);
  assert.equal(puedePublicar(resultado, { ...valida, revision: 'b'.repeat(64) }), false);
  assert.equal(puedePublicar(resultado, { ...valida, valido: false }), false);
  assert.equal(puedePublicar({ ...resultado, planificacion: { ...resultado.planificacion, estadoPlanificacion: 'publicado' } }, valida), false);
});

test('public API uses only proposal-result endpoints and preserves revision-bound multipart', async () => {
  const { resultadosHorariosApi: api } = await import('./resultados-horarios.api.ts');
  const anterior = globalThis.fetch;
  const solicitudes = [];
  try {
    globalThis.fetch = async (url, opciones) => {
      solicitudes.push({ url, ...opciones });
      return Response.json({ status: 'success', data: resultado });
    };
    const movimiento = { revision: resultado.revision, idsHorarios: [11, 12], bloqueInicioId: 84 };
    await api.consultar(2); await api.validarMovimiento(2, movimiento); await api.mover(2, movimiento);
    await api.importar(2, resultado.revision, new File(['xlsx'], 'respuesta.xlsx'));
    await api.validarPublicacion(2); await api.publicar(2, resultado.revision);
    assert.deepEqual(solicitudes.map(s => new URL(s.url).pathname), [
      '/api/resultados-horarios/2', '/api/resultados-horarios/2/validar-movimiento', '/api/resultados-horarios/2/movimientos',
      '/api/resultados-horarios/2/salas/importar', '/api/resultados-horarios/2/validacion-publicacion', '/api/resultados-horarios/2/publicar',
    ]);
    assert.deepEqual(JSON.parse(solicitudes[2].body), movimiento);
    assert.equal(solicitudes[3].body.get('revision'), resultado.revision);
    assert.equal(solicitudes[3].body.get('archivo').name, 'respuesta.xlsx');
    assert.equal(solicitudes[3].headers.has('Content-Type'), false);
    assert.deepEqual(JSON.parse(solicitudes[5].body), { revision: resultado.revision });
  } finally { globalThis.fetch = anterior; }
});

test('calendar distinguishes neutral external sessions and ready managed sessions without changing consultation', async () => {
  const { createServer } = await import('vite');
  const { createElement } = await import('react');
  const { renderToStaticMarkup } = await import('react-dom/server');
  const servidor = await createServer({ envFile: false, server: { middlewareMode: true }, appType: 'custom' });
  try {
    const { default: Calendario } = await servidor.ssrLoadModule('/src/features/resultados-horarios/CalendarioResultados.tsx');
    const conReservas = { ...resultado, bloquesReservadosIds: [90, 187] };
    const reserva = renderToStaticMarkup(createElement(Calendario, { resultado: conReservas, nivel: '', seleccionar() {},
      movimiento: { sesion, idsHorarios: [11, 12], cantidad: 2, inicioId: 190, invalido: false, elegir() {} },
    }));
    assert.equal([...reserva.matchAll(/data-reserva=/g)].length, 2);
    assert.match(reserva, /Incluye reserva/);
    assert.match(reserva, /aria-label="Estructuras de Datos, sección 1, Teórica, Docente, Sala pendiente"/);
    assert.match(reserva, /<button[^>]*disabled=""[^>]*aria-label="Martes 08:10–08:50: [^"]*grupo incluye una reserva/);
    assert.match(reserva, /aria-label="Martes 08:50–09:30: reservado/);
    assert.doesNotMatch(reserva, /Vista previa sin guardar/);
    assert.match(reserva, /class="[^"]*reserva/);
    const vacio = renderToStaticMarkup(createElement(Calendario, { resultado: conReservas, nivel: '5', seleccionar() {} }));
    assert.equal([...vacio.matchAll(/>Reservado</g)].length, 2);
    assert.doesNotMatch(vacio, /Clase en bloque reservado|aria-label="Estructuras/);
    const externa = { ...sesion, idsHorarios: [20, 21], bloquesIds: [90, 87], editable: false, estadoSala: 'externa' };
    const asignada = { ...sesion, idsHorarios: [30, 31], bloquesIds: [84, 81], estadoSala: 'asignada', salas: [{ id: 1, nombre: 'A-101' }, { id: 1, nombre: 'A-101' }] };
    const laboratorio = { ...sesion, idsHorarios: [40, 41], bloquesIds: [78, 75], estadoSala: 'laboratorio', tipoHora: { id: 3, tipo: 'Laboratorio' } };
    const html = renderToStaticMarkup(createElement(Calendario, { resultado: { ...resultado, sesiones: [sesion, externa, asignada, laboratorio] }, nivel: '', seleccionar: () => {} }));
    for (const texto of ['Horario semanal', 'Estructuras de Datos', 'Sala pendiente', 'Horario externo', 'Docente', 'A-101']) assert.ok(html.includes(texto), texto);
    assert.doesNotMatch(html, /Horario externo fijo|<dialog/);
    assert.match(html, /aria-haspopup="dialog"/);
    const protegidas = [...html.matchAll(/<button\b[^>]*sesionLista[^>]*>/g)].map(([boton]) => boton);
    assert.equal(protegidas.length, 2);
    assert.equal(protegidas.every(b => !b.includes('disabled=""')), true);
    const externas = [...html.matchAll(/<button\b[^>]*sesionExterna[^>]*>/g)].map(([boton]) => boton);
    assert.equal(externas.length, 1);
    assert.equal(externas.every(b => !b.includes('disabled=""') && b.includes('aria-haspopup="dialog"')), true);
    const pendientes = [...html.matchAll(/<button\b[^>]*sesionPendiente[^>]*>/g)].map(([boton]) => boton);
    assert.equal(pendientes.length, 1);
    assert.equal(pendientes.every(b => !b.includes('disabled=""')), true);
    for (const estadoPlanificacion of ['propuesta', 'publicado']) {
      const exenta = { ...sesion, estadoSala: 'noRequiere', salas: sesion.salas.map(() => null) };
      const exentoHtml = renderToStaticMarkup(createElement(Calendario, {
        resultado: { ...resultado, planificacion: { ...resultado.planificacion, estadoPlanificacion }, sesiones: [exenta] },
        nivel: '', seleccionar() {},
      }));
      const tarjetas = [...exentoHtml.matchAll(/<button\b[^>]*aria-label="Estructuras[^>]*>/g)].map(([boton]) => boton);
      assert.equal(tarjetas.length, 1);
      for (const tarjeta of tarjetas) {
        assert.match(tarjeta, /sesionLista/);
        assert.doesNotMatch(tarjeta, /sesionPendiente/);
        assert.equal(tarjeta.includes('disabled=""'), false, 'La consulta admite detalle aun en períodos publicados.');
      }
      assert.match(exentoHtml, /No requiere sala/);
    }
    const tarjetasLaboratorio = [...html.matchAll(/<button\b[^>]*aria-label="[^"]*Laboratorio[^"]*"[^>]*>[\s\S]*?<\/button>/g)];
    assert.equal(tarjetasLaboratorio.length, 1);
    for (const [tarjeta] of tarjetasLaboratorio) assert.doesNotMatch(tarjeta, /sala/i);
    const semana = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes'].flatMap((dia, indice) =>
      bloques.map(bloque => ({ ...bloque, id: bloque.id + indice * 100, dia })));
    for (const movimiento of [undefined, { sesion, idsHorarios: [11, 12], cantidad: 2, inicioId: 84, invalido: false, elegir: () => {} }]) {
      const grilla = renderToStaticMarkup(createElement(Calendario, {
        resultado: { ...resultado, bloques: semana }, nivel: '', seleccionar: () => {}, movimiento,
      }));
      assert.match(grilla, /grid-template-columns:7rem/);
      assert.match(grilla, /grid-template-rows:3rem repeat\(6, minmax\(2.75rem, auto\)\)/);
      if (movimiento) {
        const destinos = [...grilla.matchAll(/<button\b[^>]*class="[^"]*_destino_[^"]*"[^>]*>[\s\S]*?<\/button>/g)].map(([b]) => b);
        assert.equal(destinos.length, semana.length);
        assert.equal(destinos.every(b => /aria-label="[^"]+"/.test(b)), true);
        assert.match(grilla, />Libre</);
        assert.match(grilla, /<button[^>]*sinDisponibilidad[^>]*aria-label="Lunes 08:10–08:50: ocupado;/);
        assert.match(grilla, /<button[^>]*disponible[^>]*aria-label="Martes 08:10–08:50: libre con disponibilidad;/);
      }
    }
    const { default: Controles } = await servidor.ssrLoadModule('/src/features/resultados-horarios/ControlesMovimiento.tsx');
    const controles = renderToStaticMarkup(createElement(Controles, { resultado, sesion, grupo: 0,
      datos: { revision: resultado.revision, idsHorarios: sesion.idsHorarios, bloqueInicioId: 0 }, validacion: null, error: '', aprobado: false,
      ocupado: false, cambiarGrupo() {}, cancelar() {}, confirmar() {} }));
    assert.match(controles, /Sesión completa/);
    assert.match(controles, /Confirmar movimiento/);
    assert.match(controles, /disabled=""[^>]*>Confirmar movimiento/);
    assert.equal([...controles.matchAll(/<select\b/g)].length, 0);
    assert.match(controles, /Selecciona el destino en la grilla\./);
    assert.doesNotMatch(controles, /Destinos de |verde claro =|Gris =|borde discontinuo|Inicio del destino<select/);
    const elegido = renderToStaticMarkup(createElement(Controles, { resultado, sesion, grupo: 0,
      datos: { revision: resultado.revision, idsHorarios: sesion.idsHorarios, bloqueInicioId: 190 }, validacion: null, error: '', aprobado: false,
      ocupado: false, cambiarGrupo() {}, cancelar() {}, confirmar() {} }));
    assert.match(elegido, /aria-label="Movimiento seleccionado"/);
    assert.match(elegido, /Origen/); assert.match(elegido, /Destino/);
    assert.match(elegido, /aria-hidden="true"[^>]*>→/);
    assert.match(elegido, /Martes/); assert.match(elegido, /08:10–11:00/);
    assert.doesNotMatch(controles, /<dialog|<table/);
    const { default: GestionSalas } = await servidor.ssrLoadModule('/src/features/resultados-horarios/GestionSalas.tsx');
    const salas = renderToStaticMarkup(createElement(GestionSalas, { resultado, ocupado: false, exportar: () => {}, importar: () => {}, seleccionar: () => {} }));
    for (const texto of ['Exportar solicitud', 'Exportar pendiente', 'Importar respuesta', 'SIN SALA', 'Estructuras de Datos']) assert.ok(salas.includes(texto), texto);
    const publicado = renderToStaticMarkup(createElement(GestionSalas, { resultado: { ...resultado, planificacion: { ...resultado.planificacion, estadoPlanificacion: 'publicado' } }, ocupado: false, exportar: () => {}, importar: () => {}, seleccionar: () => {} }));
    assert.doesNotMatch(publicado, /type="file"|Importar respuesta/);
    assert.match(publicado, /solo lectura/i);
  } finally { await servidor.close(); }
});

test('selected group is grey and its unsaved destination preview does not mutate the timetable', async () => {
  const { createServer } = await import('vite');
  const { createElement } = await import('react');
  const { renderToStaticMarkup } = await import('react-dom/server');
  const { readFile } = await import('node:fs/promises');
  const servidor = await createServer({ envFile: false, server: { middlewareMode: true }, appType: 'custom' });
  const original = JSON.stringify(resultado);
  try {
    const { default: Calendario } = await servidor.ssrLoadModule('/src/features/resultados-horarios/CalendarioResultados.tsx');
    const movimiento = { sesion, idsHorarios: [11, 12], cantidad: 2, inicioId: 190, invalido: false, elegir() {} };
    const renderizar = proyeccion => renderToStaticMarkup(createElement(Calendario, {
      resultado, nivel: '3', seleccionar() {}, movimiento: proyeccion,
    }));
    const html = renderizar(movimiento);
    assert.doesNotMatch(html, /data-grupo-origen=|origen-movimiento-calendario|Origen ·/);
    assert.equal([...html.matchAll(/role="note"/g)].length, 1);
    assert.match(html, /Vista previa sin guardar: Estructuras de Datos/);
    assert.match(html, /data-bloque-id="190"/);
    assert.match(html, /data-bloque-id="187"/);
    assert.match(html, /Sin guardar/);
    assert.doesNotMatch(renderizar({ ...movimiento, invalido: true }), /role="note"/);
    assert.doesNotMatch(renderizar({ ...movimiento, inicioId: 84 }), /role="note"/);
    assert.doesNotMatch(renderizar({ ...movimiento, inicioId: 175 }), /role="note"/);
    assert.doesNotMatch(renderizar(undefined), /role="note"|seleccionada/);
    const completa = renderizar({ ...movimiento, idsHorarios: sesion.idsHorarios, cantidad: 4 });
    assert.equal([...completa.matchAll(/role="note"/g)].length, 1);
    const otraMitad = renderizar({ ...movimiento, idsHorarios: [13, 14] });
    assert.doesNotMatch(otraMitad, /data-grupo-origen=|origen-movimiento-calendario|Origen ·/);
    assert.equal(JSON.stringify(resultado), original);
    const css = await readFile(new URL('./ResultadosHorarios.module.css', import.meta.url), 'utf8');
    assert.match(css, /\.seleccionada[^{}]*\{[^}]*background:\s*#e5e7eb\s*;/);
    assert.match(css, /\.vistaPrevia\s*\{[^}]*background:\s*#e5e7eb\s*;[^}]*pointer-events:\s*none\s*;/);
  } finally { await servidor.close(); }
});

test('S11 cells show their own availability while only odd starts admit a full group', async () => {
  const { createServer } = await import('vite');
  const { createElement } = await import('react');
  const { renderToStaticMarkup } = await import('react-dom/server');
  const servidor = await createServer({ envFile: false, server: { middlewareMode: true }, appType: 'custom' });
  const triple = { ...sesion, idsHorarios: [11, 12, 13], bloquesIds: [90, 87, 84], salas: [null, null, null] };
  const contexto = { ...resultado, sesiones: [triple], disponibilidades: resultado.disponibilidades.filter(d => ![181, 178, 175].includes(d.bloqueId)) };
  const original = JSON.stringify(contexto);
  try {
    const { default: Calendario } = await servidor.ssrLoadModule('/src/features/resultados-horarios/CalendarioResultados.tsx');
    const { default: Controles } = await servidor.ssrLoadModule('/src/features/resultados-horarios/ControlesMovimiento.tsx');
    const movimiento = { sesion: triple, idsHorarios: triple.idsHorarios, cantidad: 3, inicioId: 190, invalido: false, elegir() {} };
    const renderizar = (datos = contexto, seleccion = movimiento) => renderToStaticMarkup(createElement(Calendario, {
      resultado: datos, nivel: '3', seleccionar() {}, movimiento: seleccion,
    }));
    const celdas = html => [...html.matchAll(/<div\b[^>]*data-destino-id[^>]*>[\s\S]*?<\/button>/g)].map(([celda]) => celda);
    const celda = (html, hora) => celdas(html).find(c => c.includes(`aria-label="Martes ${hora}:`));
    const html = renderizar();
    for (const hora of ['08:10–08:50', '08:50–09:30', '09:40–10:20']) assert.match(celda(html, hora), /class="[^"]*disponible/);
    assert.doesNotMatch(celda(html, '08:50–09:30'), /disabled=""/);
    assert.match(celda(html, '08:50–09:30'), /aria-label="[^"]*destino de 3 bloques desde 08:10/);
    assert.doesNotMatch(celda(html, '08:10–08:50'), /<button[^>]*disabled/);
    assert.equal([...html.matchAll(/role="note"/g)].length, 1);
    assert.doesNotMatch(html, /data-grupo-origen=|origen-movimiento-calendario|Origen ·/);
    for (const id of [190, 187, 184]) assert.match(html, new RegExp(`data-bloque-id="${id}"`));
    const sinTercero = { ...contexto, disponibilidades: contexto.disponibilidades.filter(d => d.bloqueId !== 184) };
    const invalido = renderizar(sinTercero);
    assert.match(celda(invalido, '08:10–08:50'), /class="[^"]*disponible/);
    assert.match(celda(invalido, '08:50–09:30'), /class="[^"]*disponible/);
    assert.match(celda(invalido, '09:40–10:20'), /class="[^"]*sinDisponibilidad/);
    assert.doesNotMatch(invalido, /role="note"/);
    const final = renderizar(resultado, { ...movimiento, inicioId: 0 });
    assert.match(celda(final, '11:10–11:50'), /class="[^"]*disponible/);
    assert.match(celda(final, '11:10–11:50'), /<button[^>]*disabled=""/);
    const controles = renderToStaticMarkup(createElement(Controles, { resultado: contexto, sesion: triple, grupo: 0,
      datos: { revision: contexto.revision, idsHorarios: triple.idsHorarios, bloqueInicioId: 0 },
      validacion: null, error: '', aprobado: false, ocupado: false, cambiarGrupo() {}, cancelar() {}, confirmar() {} }));
    assert.equal([...controles.matchAll(/<select\b/g)].length, 0);
    assert.doesNotMatch(controles, /<option[^>]*value="187"/);
    assert.match(controles, /disabled=""[^>]*>Confirmar movimiento/);
    assert.equal(JSON.stringify(contexto), original);
    const m = await import('./modelo.ts');
    for (const otra of [
      { ...sesion, profesorId: 99, bloquesIds: [184], idsHorarios: [99] },
      { ...sesion, asignatura: { ...sesion.asignatura, semestreMalla: 5 }, bloquesIds: [184], idsHorarios: [99] },
    ]) assert.match(celda(renderizar({ ...contexto, sesiones: [triple, otra] }), '09:40–10:20'), /sinDisponibilidad/);
    const libre = { ...sesion, profesorId: 99, asignatura: { ...sesion.asignatura, semestreMalla: 5 }, bloquesIds: [184], idsHorarios: [99] };
    assert.equal(m.estadoDestino({ ...contexto, sesiones: [triple, libre] }, triple, 190, 3), 'disponible');
    assert.equal(m.estadoDestino(sinTercero, triple, 190, 3), 'sinDisponibilidad');
    assert.equal(m.destinoDisponible(contexto, triple, 187, 2), true);
    const datos = { revision: resultado.revision, idsHorarios: triple.idsHorarios, bloqueInicioId: 187 };
    assert.equal(m.puedeConfirmarMovimiento(contexto, triple, datos, { clave: m.claveMovimiento(2, datos), valido: true, problemas: [] }), false);
  } finally { await servidor.close(); }
});

test('S11 partial group options use institutional residual starts and keep whole legacy sessions', async () => {
  const quinta = { ...sesion, idsHorarios: [11, 12, 13, 14, 15], bloquesIds: bloques.slice(0, 5).map(b => b.id) };
  const props = sesionActual => ({ resultado: { ...resultado, sesiones: [sesionActual] }, sesion: sesionActual, grupo: 0,
    datos: { revision: resultado.revision, idsHorarios: sesionActual.idsHorarios, bloqueInicioId: 0 },
    validacion: null, error: '', aprobado: false, ocupado: false, cambiarGrupo() {}, cancelar() {}, confirmar() {} });
  const controles = await montar('./ControlesMovimiento.tsx', 'ControlesMovimiento', props(quinta), {});
  try {
    const opciones = controles.buscar('button').filter(b => typeof b.props['aria-pressed'] === 'boolean');
    assert.deepEqual(opciones.map(o => controles.texto(o).match(/(\d+) bloques/)[1]), ['5', '2', '2', '3']);
    const m = await import('./modelo.ts');
    assert.deepEqual(m.gruposMovibles(quinta, bloques), [[11, 12, 13, 14, 15], [11, 12], [14, 15], [13, 14, 15]]);
    const legacy = { ...quinta, idsHorarios: [11, 12, 13], bloquesIds: bloques.slice(1, 4).map(b => b.id) };
    assert.deepEqual(m.gruposMovibles(legacy, bloques), [legacy.idsHorarios]);
  } finally { controles.cerrar(); }
});

test('S11 imperative even starts are ignored and obsolete previews cannot approve invalid destinations', async () => {
  const solicitudes = []; let guardados = 0;
  const pagina = await montar('./ResultadosHorariosPage.tsx', 'ContenidoResultados', { id: 2, ocupado: false, actualizarPlanificacion() {} }, {
    consultar: async () => resultado,
    validarMovimiento(id, datos, signal) { const llamada = { ...diferida(), datos, signal }; solicitudes.push(llamada); return llamada.promesa; },
    mover: async () => { guardados++; return resultado; },
  });
  try {
    await pagina.asentar(); pagina.componente('GestionSalas').props.seleccionar(sesion); pagina.renderizar();
    const elegir = id => { pagina.componente('CalendarioResultados').props.movimiento.elegir(id); pagina.renderizar(); };
    elegir(187);
    assert.equal(pagina.componente('ControlesMovimiento').props.datos.bloqueInicioId, 0);
    assert.equal(solicitudes.length, 0);
    elegir(190); elegir(184);
    assert.equal(solicitudes[0].signal.aborted, true);
    elegir(187);
    assert.equal(pagina.componente('ControlesMovimiento').props.datos.bloqueInicioId, 184);
    elegir(178); // Odd number 5, but too short for the whole four-block group.
    solicitudes[0].resolver({ valido: true, problemas: [] }); solicitudes[1].resolver({ valido: true, problemas: [] });
    await pagina.asentar();
    assert.equal(pagina.componente('ControlesMovimiento').props.aprobado, false);
    assert.equal(pagina.componente('CalendarioResultados').props.movimiento.invalido, true);
    pagina.componente('ControlesMovimiento').props.confirmar();
    assert.equal(guardados, 0); assert.equal(solicitudes.length, 2);
  } finally { pagina.cerrar(); }
});

test('S11 period state is immediately beside refresh and the removed paragraph stays absent', async () => {
  const pagina = await montar('./ResultadosHorariosPage.tsx', 'ContenidoResultados', { id: 2, ocupado: false, actualizarPlanificacion() {} }, { consultar: async () => resultado });
  try {
    await pagina.asentar();
    assert.equal(pagina.buscar('p').some(p => pagina.texto(p).startsWith('Las tarjetas celestes están listas:')), false);
    const controles = pagina.buscar('div').find(div => div.props.children?.some?.(hijo => hijo?.props?.onClick === pagina.boton('Actualizar horario').props.onClick));
    assert.ok(controles);
    assert.equal(controles.props.children.length, 3);
    assert.equal(pagina.texto(controles.props.children[1]), 'Estado: Propuesta');
  } finally { pagina.cerrar(); }
});

test('S11 an unavailable third block prevents server preview and saving the whole group', async () => {
  const triple = { ...sesion, idsHorarios: [11, 12, 13], bloquesIds: [90, 87, 84], salas: [null, null, null] };
  const contexto = { ...resultado, sesiones: [triple], disponibilidades: resultado.disponibilidades.filter(d => d.bloqueId !== 184) };
  const original = JSON.stringify(contexto); let solicitudes = 0; let guardados = 0;
  const pagina = await montar('./ResultadosHorariosPage.tsx', 'ContenidoResultados', { id: 2, ocupado: false, actualizarPlanificacion() {} }, {
    consultar: async () => contexto,
    validarMovimiento: async () => { solicitudes++; return { valido: true, problemas: [] }; },
    mover: async () => { guardados++; return contexto; },
  });
  try {
    await pagina.asentar(); pagina.componente('GestionSalas').props.seleccionar(triple); pagina.renderizar();
    pagina.componente('CalendarioResultados').props.movimiento.elegir(190); pagina.renderizar(); await pagina.asentar();
    assert.equal(pagina.componente('ControlesMovimiento').props.aprobado, false);
    assert.equal(pagina.componente('CalendarioResultados').props.movimiento.invalido, true);
    pagina.componente('ControlesMovimiento').props.confirmar();
    assert.equal(solicitudes, 0); assert.equal(guardados, 0); assert.equal(JSON.stringify(contexto), original);
  } finally { pagina.cerrar(); }
});

test('la consulta selecciona solo una planificación autorizada sin alterar la selección anterior', async () => {
  const a = { ...resultado.planificacion, id: 101, actual: true, carrera: { nombre: 'Carrera A' } };
  const b = { ...resultado.planificacion, id: 202, actual: false, carrera: { nombre: 'Carrera B' } };
  for (const [consulta, esperado] of [['', 101], ['?planificacion=202', 202], ['?planificacion=999', null]]) {
    const pagina = await montar('./ResultadosHorariosPage.tsx', 'ConsultaResultados', {}, { consulta, planificaciones: async () => [a, b] });
    try {
      await pagina.asentar();
      assert.equal(pagina.componente('ContenidoResultados')?.props.id ?? null, esperado);
    } finally { pagina.cerrar(); }
  }
});

// Execute the real component's hooks and handlers with deferred requests, without a DOM or network.
async function montar(nombreArchivo, nombreFuncion, propiedades, api) {
  const React = await import('react');
  const { readFile } = await import('node:fs/promises');
  const ts = await import('typescript');
  const modelo = await import('./modelo.ts');
  const datos = await import('../asignaturas/datos.ts');
  const disponibilidad = await import('../disponibilidad/estado.ts');
  const { ApiError } = await import('../../lib/api.ts');
  const fuente = (await readFile(new URL(nombreArchivo, import.meta.url), 'utf8'))
    .replace(/^import .*;\r?\n/gm, '').replace(/^export default function /gm, 'function ').replace(/^export /gm, '');
  const componentes = Object.fromEntries(['CalendarioResultados', 'GestionSalas', 'ControlesMovimiento', 'PublicacionDialogo', 'Dialogo', 'DetalleSesionDialogo'].map(nombre => [nombre, () => null]));
  const avisos = [], avisosCerrados = [];
  let siguienteAviso = 0;
  const notificaciones = Object.fromEntries(['exito', 'error', 'advertencia'].map(tipo => [tipo, (mensaje, id) => {
    const identidad = id ?? ++siguienteAviso;
    avisos.push({ tipo, mensaje, id: identidad }); return identidad;
  }]));
  notificaciones.cerrar = id => avisosCerrados.push(id);
  const valores = [], efectos = [], pendientes = [];
  let indice = 0, sucio = false, arbol;
  const auxiliares = { ...(await import('./calendario/disposicion.ts').catch(() => ({}))), ...(await import('./calendario/gesto.ts').catch(() => ({}))), ...(await import('./calendario/presentacion.ts')), ...(await import('../mi-horario/modelo.ts')) };
  const entorno = { React, ...auxiliares, ...modelo, ...datos, ...(await import('./permisos.ts')), claveDia: disponibilidad.claveDia, ordenarBloques: disponibilidad.ordenarBloques, ...componentes, ApiError, estilos: {}, calendario: {}, MarcadorReserva: () => null, IconoArchivo: () => null, resultadosHorariosApi: api, notificaciones,
    ...(await import('../../lib/periodos.ts')),
    useAuth: () => ({ usuario: { id: 1, rol: 'secretaria' } }), Navigate: () => null, Outlet: () => null,
    useSearchParams: () => [new URLSearchParams(api.consulta ?? '')], Link: () => null,
    rutaModelo: (id) => `/app/optimizacion?planificacion=${id}`,
    useState(inicial) {
      const posicion = indice++;
      if (!(posicion in valores)) valores[posicion] = typeof inicial === 'function' ? inicial() : inicial;
      return [valores[posicion], nuevo => { valores[posicion] = typeof nuevo === 'function' ? nuevo(valores[posicion]) : nuevo; sucio = true; }];
    },
    useRef(inicial) {
      const posicion = indice++;
      if (!(posicion in valores)) valores[posicion] = { current: inicial };
      return valores[posicion];
    },
    useReducer(reducir, inicial) {
      const posicion = indice++;
      if (!(posicion in valores)) valores[posicion] = inicial;
      return [valores[posicion], accion => { valores[posicion] = reducir(valores[posicion], accion); sucio = true; }];
    },
    useEffect(efecto, dependencias) {
      const posicion = indice++;
      const anterior = efectos[posicion];
      if (!anterior || dependencias?.some((valor, i) => !Object.is(valor, anterior.dependencias?.[i]))) {
        pendientes.push(() => { anterior?.limpiar?.(); efectos[posicion] = { dependencias, limpiar: efecto() }; });
      }
    },
  };
  Object.assign(entorno, api.entorno);
  delete entorno[nombreFuncion];
  const codigo = ts.transpileModule(`export function crear(entorno) { const { ${Object.keys(entorno).join(', ')} } = entorno;
    ${fuente}\n return ${nombreFuncion}; }`, {
    compilerOptions: { jsx: ts.JsxEmit.React, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const { crear } = await import(`data:text/javascript;base64,${Buffer.from(codigo).toString('base64')}`);
  const componente = crear(entorno);
  function renderizar() {
    do { sucio = false; indice = 0; arbol = componente(propiedades); pendientes.splice(0).forEach(e => e()); } while (sucio);
  }
  function buscar(tipo, elemento = arbol) {
    if (!React.isValidElement(elemento)) return [];
    return [...(elemento.type === tipo || (typeof elemento.type === 'function' && elemento.type.name === tipo) ? [elemento] : []),
      ...React.Children.toArray(elemento.props.children).flatMap(hijo => buscar(tipo, hijo))];
  }
  function texto(elemento) {
    if (typeof elemento === 'string' || typeof elemento === 'number') return String(elemento);
    return React.isValidElement(elemento) ? React.Children.toArray(elemento.props.children).map(texto).join('') : '';
  }
  propiedades.cambiarOcupado ??= valor => { propiedades.ocupado = valor; sucio = true; };
  renderizar();
  return {
    componentes, buscar, texto, renderizar, avisos, avisosCerrados,
    componente: nombre => buscar(componentes[nombre] ?? nombre)[0],
    boton: nombre => buscar('button').find(b => texto(b).includes(nombre)),
    async asentar() { for (let i = 0; i < 5; i++) await Promise.resolve(); renderizar(); },
    cerrar() { efectos.forEach(e => e.limpiar?.()); },
  };
}
function diferida() {
  let resolver, rechazar;
  const promesa = new Promise((si, no) => { resolver = si; rechazar = no; });
  return { promesa, resolver, rechazar };
}

test('admin consulta calendario y detalle sin ninguna acción operativa', async () => {
  const llamadas = [];
  const pagina = await montar('./ResultadosHorariosPage.tsx', 'ContenidoResultados', { id: 2, ocupado: false, actualizarPlanificacion() {} }, {
    consultar: async () => resultado,
    entorno: { useAuth: () => ({ usuario: { id: 7, rol: 'admin' } }) },
    mover: async () => llamadas.push('mover'), exportar: async () => llamadas.push('exportar'), descartar: async () => llamadas.push('descartar'),
  });
  try {
    await pagina.asentar();
    for (const accion of ['Editar horario', 'Revisar y publicar', 'Descartar propuesta']) assert.equal(pagina.boton(accion), undefined);
    assert.equal(pagina.componente('GestionSalas'), undefined);
    pagina.buscar('button').find(b => b.props['aria-label'] === 'Ver semestre 3').props.onClick(); pagina.renderizar();
    assert.equal(pagina.componente('CalendarioResultados').props.editar, false);
    pagina.componente('CalendarioResultados').props.seleccionar(sesion); pagina.renderizar();
    assert.equal(pagina.componente('DetalleSesionDialogo').props.sesion, sesion);
    assert.deepEqual(llamadas, []);
  } finally { pagina.cerrar(); }
});

test('secretaría confirma descarte explícito con revisión y vuelve a Preparación sin reinicio general', async () => {
  const llamadas = [], actualizadas = [];
  const planificacion = { ...resultado.planificacion, estadoPlanificacion: 'preparacion' };
  const pagina = await montar('./ResultadosHorariosPage.tsx', 'ContenidoResultados', { id: 2, ocupado: false, actualizarPlanificacion: p => actualizadas.push(p) }, {
    consultar: async () => resultado,
    descartar: async (...datos) => { llamadas.push(datos); return { planificacion }; },
  });
  try {
    await pagina.asentar();
    pagina.boton('Descartar propuesta').props.onClick(); pagina.renderizar();
    const confirmar = () => pagina.boton('Confirmar descarte');
    assert.equal(confirmar().props.disabled, true);
    confirmar().props.onClick(); await pagina.asentar(); assert.deepEqual(llamadas, []);
    assert.ok(pagina.buscar('p').some(p => pagina.texto(p).includes('ofertas, asignaciones, disponibilidades y horarios externos')));
    pagina.buscar('input').find(p => p.props.type === 'checkbox').props.onChange({ target: { checked: true } }); pagina.renderizar();
    assert.equal(confirmar().props.disabled, false);
    confirmar().props.onClick(); await pagina.asentar();
    assert.deepEqual(llamadas, [[2, resultado.revision]]);
    assert.equal(actualizadas.at(-1), planificacion);
  } finally { pagina.cerrar(); }
});

const conSalaParaExportar = { ...sesion, idsHorarios: [21, 22, 23, 24], estadoSala: 'asignada', salas: sesion.salas.map(() => ({ id: 4, nombre: 'A107AC' })) };
for (const caso of [
  { nombre: 'solicitud inicial sin asignaciones', sesiones: [sesion], pendientes: 1, completa: true, pendiente: false },
  { nombre: 'respuesta parcial con sesiones pendientes', sesiones: [sesion, conSalaParaExportar], pendientes: 1, completa: false, pendiente: true },
  { nombre: 'asignación completa', sesiones: [conSalaParaExportar], pendientes: 0, completa: false, pendiente: false },
  { nombre: 'sin sesiones solicitables', sesiones: [], pendientes: 0, completa: false, pendiente: false },
  { nombre: 'salas externas, de laboratorio y exentas no cuentan como asignaciones solicitables', sesiones: [sesion,
    ...['externa', 'laboratorio', 'noRequiere'].map((estadoSala, indice) => ({ ...conSalaParaExportar, idsHorarios: [30 + indice], estadoSala }))], pendientes: 1, completa: true, pendiente: false },
  { nombre: 'sesión gestionada con parte de sus bloques asignados', sesiones: [{ ...sesion, salas: [{ id: 4, nombre: 'A107AC' }, null, null, null] }], pendientes: 1, completa: false, pendiente: true },
]) test(`la exportación usa las asignaciones actuales: ${caso.nombre}`, async () => {
  const solicitudes = [];
  const contexto = { ...resultado, pendientesSala: caso.pendientes, sesiones: caso.sesiones };
  const original = JSON.stringify(contexto);
  const propiedades = { resultado: contexto, ocupado: false, exportar: valor => solicitudes.push(valor), importar() {}, seleccionar() {} };
  const pagina = await montar('./GestionSalas.tsx', 'GestionSalas', propiedades, {});
  try {
    const completa = pagina.boton('Exportar solicitud'); const pendiente = pagina.boton('Exportar pendiente');
    assert.ok(completa); assert.ok(pendiente);
    assert.equal(completa.props.disabled, !caso.completa); assert.equal(pendiente.props.disabled, !caso.pendiente);
    completa.props.onClick(); pendiente.props.onClick();
    assert.deepEqual(solicitudes, [...(caso.completa ? [false] : []), ...(caso.pendiente ? [true] : [])]);
    const anteriores = [...solicitudes]; propiedades.ocupado = true; pagina.renderizar();
    for (const nombre of ['Exportar solicitud', 'Exportar pendiente']) {
      const boton = pagina.boton(nombre); assert.equal(boton.props.disabled, true); boton.props.onClick();
    }
    assert.deepEqual(solicitudes, anteriores); assert.equal(JSON.stringify(contexto), original);
  } finally { pagina.cerrar(); }
});

for (const estadoPlanificacion of ['propuesta', 'publicado']) test(`los pendientes se pueden consultar otra vez en tarjetas sin importar: ${estadoPlanificacion}`, async () => {
  const primera = { ...sesion, asignatura: { codigo: '620473', nombre: 'Seguridad Informática', semestreMalla: 10 }, dia: 'Lunes', horaInicio: '12:40', horaTermino: '14:50' };
  const segunda = { ...primera, idsHorarios: [21, 22], tipoHora: { id: 2, tipo: 'Práctica' }, dia: 'Miércoles', horaTermino: '14:00' };
  const tercera = { ...sesion, idsHorarios: [31, 32], asignatura: { codigo: '611049', nombre: 'Economía', semestreMalla: 6 }, horaTermino: '10:20' };
  const contexto = { ...resultado, planificacion: { ...resultado.planificacion, estadoPlanificacion }, pendientesSala: 3, sesiones: [primera, segunda, tercera] };
  const original = JSON.stringify(contexto); let lecturas = 0;
  const pagina = await montar('./ResultadosHorariosPage.tsx', 'ContenidoResultados', { id: 2, ocupado: false, actualizarPlanificacion() {} }, {
    consultar: async () => { lecturas++; return contexto; },
    importar: async () => assert.fail('Consultar pendientes no debe importar el archivo'),
  });
  try {
    await pagina.asentar(); assert.equal(pagina.componente('Dialogo'), undefined);
    for (let vez = 0; vez < 2; vez++) {
      pagina.componente('GestionSalas').props.verPendientes(); pagina.renderizar();
      assert.equal(pagina.componente('Dialogo').props.titulo, 'Asignaturas sin sala');
      const lista = pagina.buscar('ul').find(ul => ul.props['aria-label'] === 'Sesiones sin sala');
      assert.ok(lista); assert.equal(pagina.buscar('article', lista).length, 3);
      const tarjetas = pagina.buscar('article', lista).map(pagina.texto);
      assert.match(tarjetas[0], /620473.*Seguridad Informática.*Semestre 10.*Sección 1.*Teórica.*Lunes 12:40–14:50/);
      assert.match(tarjetas[1], /620473.*Seguridad Informática.*Práctica.*Miércoles 12:40–14:00/);
      assert.match(tarjetas[2], /611049.*Economía.*Semestre 6.*Lunes 08:10–10:20/);
      assert.equal(pagina.buscar('p').some(p => pagina.texto(p).includes('La respuesta se importó')), false);
      pagina.componente('Dialogo').props.cerrar(); pagina.renderizar();
      assert.equal(pagina.componente('Dialogo'), undefined);
    }
    assert.equal(lecturas, 1); assert.deepEqual(pagina.avisos, []); assert.equal(JSON.stringify(contexto), original);
  } finally { pagina.cerrar(); }
});

test('solo el diálogo con tarjetas de pendientes limita su ancho a 36rem', async () => {
  const { readFile } = await import('node:fs/promises');
  const css = await readFile(new URL('./ResultadosHorarios.module.css', import.meta.url), 'utf8');
  const compacto = css.match(/\.dialogo:has\(\.tarjetasPendientes\)\s*\{([^}]+)\}/)?.[1];
  assert.ok(compacto);
  assert.match(compacto, /width:\s*min\(36rem,\s*calc\(100% - 2rem\)\)/);
  const normal = css.match(/\.dialogo\s*\{([^}]+)\}/)?.[1];
  assert.match(normal, /width:\s*min\(76rem,\s*calc\(100% - 2rem\)\)/);
});

test('el botón para consultar pendientes se bloquea al estar ocupado o no tener sesiones sin sala', async () => {
  let consultas = 0;
  const propiedades = { resultado, ocupado: false, exportar() {}, importar() {}, seleccionar() {}, verPendientes() { consultas++; } };
  const pagina = await montar('./GestionSalas.tsx', 'GestionSalas', propiedades, {});
  try {
    assert.equal(pagina.boton('Ver sesiones sin sala').props.disabled, false);
    pagina.boton('Ver sesiones sin sala').props.onClick(); assert.equal(consultas, 1);
    propiedades.ocupado = true; pagina.renderizar();
    assert.equal(pagina.boton('Ver sesiones sin sala').props.disabled, true);
    pagina.boton('Ver sesiones sin sala').props.onClick(); assert.equal(consultas, 1);
    propiedades.ocupado = false; propiedades.resultado = { ...resultado, sesiones: [], pendientesSala: 0 }; pagina.renderizar();
    assert.equal(pagina.boton('Ver sesiones sin sala').props.disabled, true);
    pagina.boton('Ver sesiones sin sala').props.onClick(); assert.equal(consultas, 1);
  } finally { pagina.cerrar(); }
});

test('selecting a session projects availability onto the same semester calendar without a movement dialog', async () => {
  const pagina = await montar('./ResultadosHorariosPage.tsx', 'ContenidoResultados', { id: 2, ocupado: false, actualizarPlanificacion() {} }, {
    consultar: async () => resultado,
  });
  try {
    await pagina.asentar(); pagina.boton('3').props.onClick(); pagina.renderizar();
    pagina.boton('Editar horario').props.onClick(); pagina.renderizar();
    pagina.componente('CalendarioResultados').props.seleccionar(sesion); pagina.renderizar();
    assert.equal(pagina.buscar(pagina.componentes.CalendarioResultados).length, 1);
    const calendario = pagina.componente('CalendarioResultados');
    assert.equal(calendario.props.nivel, '3');
    assert.equal(calendario.props.movimiento.sesion, sesion);
    assert.equal(calendario.props.movimiento.cantidad, 4);
    assert.equal(pagina.buscar('dialog').length, 0);
    assert.equal(pagina.componente('ControlesMovimiento').props.sesion, sesion);
  } finally { pagina.cerrar(); }
});

for (const accion of ['cancel', 'semester', 'group', 'refresh']) test(`inline ${accion} invalidates pending previews without saving`, async () => {
  const solicitudes = [];
  let guardados = 0;
  let lecturas = 0;
  const otra = { ...sesion, idsHorarios: [21, 22], bloquesIds: [78, 75], profesorId: 9, ofertaId: 6 };
  const pagina = await montar('./ResultadosHorariosPage.tsx', 'ContenidoResultados', { id: 2, ocupado: false, actualizarPlanificacion() {} }, {
    consultar: async () => { lecturas++; return { ...resultado, revision: (lecturas === 1 ? 'a' : 'b').repeat(64), sesiones: [sesion, otra] }; },
    mover: async () => { guardados++; return resultado; },
    validarMovimiento(id, datos, signal) { const llamada = { ...diferida(), datos, signal }; solicitudes.push(llamada); return llamada.promesa; },
  });
  try {
    await pagina.asentar(); pagina.boton('3').props.onClick(); pagina.renderizar();
    pagina.boton('Editar horario').props.onClick(); pagina.renderizar();
    pagina.componente('CalendarioResultados').props.seleccionar(sesion); pagina.renderizar();
    pagina.componente('CalendarioResultados').props.movimiento.elegir(190); pagina.renderizar();
    assert.equal(solicitudes.length, 1);
    if (accion === 'cancel') pagina.componente('ControlesMovimiento').props.cancelar();
    if (accion === 'semester') pagina.boton('2').props.onClick();
    if (accion === 'group') pagina.componente('ControlesMovimiento').props.cambiarGrupo(1);
    if (accion === 'session') pagina.componente('CalendarioResultados').props.seleccionar(otra);
    if (accion === 'refresh') pagina.boton('Actualizar horario').props.onClick();
    pagina.renderizar();
    assert.equal(solicitudes[0].signal.aborted, true);
    solicitudes[0].resolver({ valido: true, problemas: [] }); await pagina.asentar();
    assert.notEqual(pagina.componente('ControlesMovimiento')?.props.aprobado, true);
    assert.equal(guardados, 0);
    if (accion === 'group') assert.equal(pagina.componente('ControlesMovimiento').props.datos.bloqueInicioId, 0);
    if (accion === 'session') assert.equal(pagina.componente('ControlesMovimiento').props.sesion, otra);
    if (accion === 'refresh') assert.equal(pagina.componente('CalendarioResultados').props.resultado.revision, 'b'.repeat(64));
  } finally { pagina.cerrar(); }
});

test('green read-only sessions cannot enter inline editing through either selection entry point', async () => {
  const protegidas = [{ ...sesion, estadoSala: 'asignada', salas: sesion.salas.map(() => ({ id: 1, nombre: 'A-101' })) },
    { ...sesion, estadoSala: 'laboratorio', idsHorarios: [41, 42] },
    { ...sesion, estadoSala: 'externa', idsHorarios: [21, 22] },
    { ...sesion, idsHorarios: [31, 32], salas: [{ id: 1, nombre: 'A-101' }, null] }];
  const pagina = await montar('./ResultadosHorariosPage.tsx', 'ContenidoResultados', { id: 2, ocupado: false, actualizarPlanificacion() {} }, {
    consultar: async () => ({ ...resultado, sesiones: protegidas }),
  });
  try {
    await pagina.asentar(); pagina.boton('3').props.onClick(); pagina.renderizar();
    for (const protegida of protegidas) for (const entrada of ['CalendarioResultados', 'GestionSalas']) {
      pagina.componente(entrada).props.seleccionar(protegida); pagina.renderizar();
      assert.equal(pagina.componente('ControlesMovimiento'), undefined);
      assert.equal(pagina.componente('CalendarioResultados').props.movimiento, undefined);
    }
  } finally { pagina.cerrar(); }
});

test('visual group choices show origin and full destination ranges and preserve selection while busy', async () => {
  const cambios = [];
  const propiedades = { resultado, sesion, grupo: 1,
    datos: { revision: resultado.revision, idsHorarios: [11, 12], bloqueInicioId: 190 },
    validacion: null, error: '', aprobado: false, ocupado: false,
    cambiarGrupo: indice => cambios.push(indice), cancelar() {}, confirmar() {} };
  const pagina = await montar('./ControlesMovimiento.tsx', 'ControlesMovimiento', propiedades, {});
  try {
    assert.equal(pagina.buscar('select').length, 0);
    const opciones = () => pagina.buscar('button').filter(b => typeof b.props['aria-pressed'] === 'boolean');
    assert.deepEqual(opciones().map(b => b.props['aria-pressed']), [false, true, false]);
    assert.deepEqual(opciones().map(b => pagina.texto(b).match(/(\d+) bloques/)[1]), ['4', '2', '2']);
    const resumen = pagina.buscar('div').find(div => div.props['aria-label'] === 'Movimiento seleccionado');
    assert.ok(resumen);
    assert.match(pagina.texto(resumen), /Origen.*Lunes.*08:10–09:30/);
    assert.match(pagina.texto(resumen), /Destino.*Martes.*08:10–09:30/);
    assert.match(pagina.texto(resumen), /Sin guardar/);
    opciones()[1].props.onClick(); assert.deepEqual(cambios, []);
    opciones()[2].props.onClick(); assert.deepEqual(cambios, [2]);
    propiedades.ocupado = true; pagina.renderizar();
    assert.equal(opciones().every(b => b.props.disabled), true);
    opciones()[0].props.onClick(); assert.deepEqual(cambios, [2]);
  } finally { pagina.cerrar(); }
});

test('two-block sessions omit redundant choices and identify the exact origin group and two unsaved destination blocks', async () => {
  const { createServer } = await import('vite');
  const { createElement } = await import('react');
  const { renderToStaticMarkup } = await import('react-dom/server');
  const servidor = await createServer({ envFile: false, server: { middlewareMode: true }, appType: 'custom' });
  const doble = { ...sesion, idsHorarios: [11, 12], bloquesIds: [90, 87], horaTermino: '09:30', salas: [null, null] };
  const contexto = { ...resultado, sesiones: [doble] };
  const original = JSON.stringify(contexto);
  try {
    const { default: Controles } = await servidor.ssrLoadModule('/src/features/resultados-horarios/ControlesMovimiento.tsx');
    const controles = renderToStaticMarkup(createElement(Controles, { resultado: contexto, sesion: doble, grupo: 0,
      datos: { revision: resultado.revision, idsHorarios: doble.idsHorarios, bloqueInicioId: 190 },
      validacion: null, error: '', aprobado: false, ocupado: false, cambiarGrupo() {}, cancelar() {}, confirmar() {} }));
    assert.equal([...controles.matchAll(/aria-pressed="true"/g)].length, 0);
    assert.doesNotMatch(controles, /Bloques que se moverán|Sesión completa|Grupo parcial|<select/);
    const { default: Calendario } = await servidor.ssrLoadModule('/src/features/resultados-horarios/CalendarioResultados.tsx');
    const html = renderToStaticMarkup(createElement(Calendario, { resultado: contexto, nivel: '3', seleccionar() {},
      movimiento: { sesion: doble, idsHorarios: doble.idsHorarios, cantidad: 2, inicioId: 190, invalido: false, elegir() {} } }));
    assert.doesNotMatch(html, /data-grupo-origen=|origen-movimiento-calendario|Origen ·/);
    assert.equal([...html.matchAll(/role="note"/g)].length, 1);
    assert.match(html, /data-bloque-id="190"/); assert.match(html, /data-bloque-id="187"/);
    assert.doesNotMatch(html, /data-bloque-id="184"/);
    assert.match(html, /<button[^>]*aria-pressed="true"[^>]*aria-label="Martes 08:50–09:30: [^"]*destino de 2 bloques desde 08:10/);
    assert.equal(JSON.stringify(contexto), original);
  } finally { await servidor.close(); }
});

for (const cantidad of [2, 3]) test(`whole-only ${cantidad}-block controls omit redundant choices and keep concise confirmation`, async () => {
  const completa = { ...sesion, idsHorarios: sesion.idsHorarios.slice(0, cantidad), bloquesIds: sesion.bloquesIds.slice(0, cantidad),
    horaTermino: bloques[cantidad - 1].horaTermino, salas: Array(cantidad).fill(null) };
  const contexto = { ...resultado, sesiones: [completa] };
  let confirmaciones = 0;
  const pagina = await montar('./ControlesMovimiento.tsx', 'ControlesMovimiento', {
    resultado: contexto, sesion: completa, grupo: 0,
    datos: { revision: contexto.revision, idsHorarios: completa.idsHorarios, bloqueInicioId: 190 },
    validacion: { valido: true, problemas: [] }, error: '', aprobado: true, ocupado: false,
    cambiarGrupo() { assert.fail('A whole-only session must not offer another group'); }, cancelar() {}, confirmar() { confirmaciones++; },
  }, {});
  try {
    assert.equal(pagina.buscar('fieldset').length, 0);
    assert.equal(pagina.buscar('legend').length, 0);
    assert.equal(pagina.buscar('button').some(b => typeof b.props['aria-pressed'] === 'boolean'), false);
    assert.ok(pagina.buscar('p').some(p => pagina.texto(p).includes(`Sección 1 · Teórica · Lunes 08:10–${completa.horaTermino}`)));
    assert.ok(pagina.buscar('p').some(p => pagina.texto(p) === `Destino validado. Confirma para guardar ${cantidad} bloques.`));
    assert.equal(pagina.buscar('p').some(p => pagina.texto(p).includes('hasta entonces el horario no cambia')), false);
    const recorrido = pagina.buscar('div').find(div => div.props['aria-label'] === 'Movimiento seleccionado');
    assert.ok(recorrido);
    assert.match(pagina.texto(recorrido), new RegExp(`Origen.*08:10–${completa.horaTermino}.*Destino.*08:10–${completa.horaTermino}`));
    assert.equal(pagina.boton('Confirmar movimiento').props.disabled, false);
    pagina.boton('Confirmar movimiento').props.onClick(); assert.equal(confirmaciones, 1);
  } finally { pagina.cerrar(); }
});

test('movement summary cards use compact platform-blue styling without recoloring the grey calendar projection', async () => {
  const { readFile } = await import('node:fs/promises');
  const css = await readFile(new URL('./ResultadosHorarios.module.css', import.meta.url), 'utf8');
  const tarjeta = css.match(/\.tramoMovimiento\s*\{([^}]+)\}/)?.[1];
  assert.ok(tarjeta);
  assert.match(tarjeta, /background:\s*var\(--color-azul-hover\)/);
  assert.match(tarjeta, /color:\s*var\(--color-azul-texto\)/);
  assert.match(tarjeta, /border:\s*1px solid var\(--color-azul-borde\)/);
  assert.match(tarjeta, /padding:\s*\.5rem \.75rem/);
  assert.match(tarjeta, /font-size:\s*\.875rem/);
  assert.match(css, /\.trayectoMovimiento\s*\{[^}]*max-width:\s*36rem/);
  assert.match(css, /\.gruposMovimiento\s*\{[^}]*width:\s*100%\s*;[^}]*max-width:\s*36rem/,
    'Las opciones de bloques deben compartir el ancho compacto de origen y destino.');
  assert.match(css, /\.opcionesGrupos\s*\{[^}]*display:\s*grid\s*;[^}]*grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/,
    'Los tres grupos deben compartir una fila de columnas iguales, sin estirar el último.');
  assert.match(css, /\.seleccionada[^{}]*\{[^}]*background:\s*#e5e7eb/);
  assert.match(css, /\.vistaPrevia\s*\{[^}]*background:\s*#e5e7eb/);
});

test('two-block whole-session movement cancels without writes and persists both blocks only after confirmation', async () => {
  const doble = { ...sesion, idsHorarios: [11, 12], bloquesIds: [90, 87], horaTermino: '09:30', salas: [null, null] };
  const contexto = { ...resultado, sesiones: [doble] };
  const original = JSON.stringify(contexto);
  let actual = contexto; let escrituras = 0;
  const consultas = []; const guardado = diferida();
  const pagina = await montar('./ResultadosHorariosPage.tsx', 'ContenidoResultados', { id: 2, ocupado: false, actualizarPlanificacion() {} }, {
    consultar: async () => actual,
    validarMovimiento: async (_id, datos) => { consultas.push(datos); return { valido: true, problemas: [] }; },
    mover(_id, datos) { escrituras++; assert.deepEqual(datos.idsHorarios, [11, 12]); return guardado.promesa; },
  });
  try {
    await pagina.asentar(); pagina.componente('GestionSalas').props.seleccionar(doble); pagina.renderizar();
    assert.deepEqual(pagina.componente('ControlesMovimiento').props.datos.idsHorarios, [11, 12]);
    pagina.componente('CalendarioResultados').props.movimiento.elegir(187); pagina.renderizar();
    assert.equal(pagina.componente('ControlesMovimiento').props.datos.bloqueInicioId, 0);
    assert.equal(consultas.length, 0);
    pagina.componente('CalendarioResultados').props.movimiento.elegir(190); pagina.renderizar(); await pagina.asentar();
    assert.equal(pagina.componente('ControlesMovimiento').props.aprobado, true);
    assert.deepEqual(consultas[0].idsHorarios, [11, 12]);
    pagina.componente('ControlesMovimiento').props.cancelar(); pagina.renderizar();
    assert.equal(escrituras, 0); assert.equal(JSON.stringify(contexto), original);
    assert.equal(pagina.componente('CalendarioResultados').props.movimiento, undefined);
    pagina.componente('GestionSalas').props.seleccionar(doble); pagina.renderizar();
    pagina.componente('CalendarioResultados').props.movimiento.elegir(190); pagina.renderizar(); await pagina.asentar();
    const confirmar = pagina.componente('ControlesMovimiento').props.confirmar;
    confirmar(); confirmar(); pagina.renderizar();
    assert.equal(escrituras, 1); assert.equal(JSON.stringify(contexto), original);
    actual = { ...contexto, revision: 'b'.repeat(64), sesiones: [{ ...doble, bloquesIds: [190, 187], dia: 'Martes' }] };
    guardado.resolver(actual); await pagina.asentar();
    assert.deepEqual(pagina.componente('CalendarioResultados').props.resultado.sesiones[0].bloquesIds, [190, 187]);
    assert.equal(pagina.componente('ControlesMovimiento'), undefined);
    pagina.boton('Actualizar horario').props.onClick(); pagina.renderizar(); await pagina.asentar();
    assert.equal(pagina.componente('CalendarioResultados').props.resultado.revision, actual.revision);
    assert.deepEqual(pagina.componente('CalendarioResultados').props.resultado.sesiones[0].bloquesIds, [190, 187]);
    assert.equal(escrituras, 1); assert.equal(JSON.stringify(contexto), original);
  } finally { pagina.cerrar(); }
});

test('two-block movement rejects an unavailable continuation without preview or persistence', async () => {
  const doble = { ...sesion, idsHorarios: [11, 12], bloquesIds: [90, 87], horaTermino: '09:30', salas: [null, null] };
  const contexto = { ...resultado, sesiones: [doble], disponibilidades: resultado.disponibilidades.filter(d => d.bloqueId !== 187) };
  const original = JSON.stringify(contexto);
  let vistas = 0; let escrituras = 0;
  const pagina = await montar('./ResultadosHorariosPage.tsx', 'ContenidoResultados', { id: 2, ocupado: false, actualizarPlanificacion() {} }, {
    consultar: async () => contexto,
    validarMovimiento: async () => { vistas++; return { valido: true, problemas: [] }; },
    mover: async () => { escrituras++; return contexto; },
  });
  try {
    await pagina.asentar(); pagina.componente('GestionSalas').props.seleccionar(doble); pagina.renderizar();
    pagina.componente('CalendarioResultados').props.movimiento.elegir(190); pagina.renderizar(); await pagina.asentar();
    assert.equal(pagina.componente('ControlesMovimiento').props.aprobado, false);
    assert.equal(pagina.componente('CalendarioResultados').props.movimiento.invalido, true);
    pagina.componente('ControlesMovimiento').props.confirmar();
    assert.equal(vistas, 0); assert.equal(escrituras, 0); assert.equal(JSON.stringify(contexto), original);
  } finally { pagina.cerrar(); }
});

test('a pending-room link selects its semester before preparing the inline movement', async () => {
  const pagina = await montar('./ResultadosHorariosPage.tsx', 'ContenidoResultados', { id: 2, ocupado: false, actualizarPlanificacion() {} }, {
    consultar: async () => resultado,
  });
  try {
    await pagina.asentar(); assert.equal(pagina.componente('CalendarioResultados'), undefined);
    pagina.componente('GestionSalas').props.seleccionar(sesion); pagina.renderizar();
    assert.equal(pagina.componente('CalendarioResultados').props.nivel, '3');
    assert.equal(pagina.componente('ControlesMovimiento').props.sesion, sesion);
  } finally { pagina.cerrar(); }
});

test('los semestres vacíos muestran solo el aviso aunque existan reservas, sin perderlas al seleccionar clases', async () => {
  for (const estadoPlanificacion of ['propuesta', 'publicado']) {
    const reservado = { ...resultado, bloquesReservadosIds: [90], planificacion: { ...resultado.planificacion, estadoPlanificacion } };
    const pagina = await montar('./ResultadosHorariosPage.tsx', 'ContenidoResultados', { id: 2, ocupado: false, actualizarPlanificacion() {} }, {
      consultar: async () => reservado,
    });
    try {
      await pagina.asentar();
      assert.equal(pagina.componente('CalendarioResultados'), undefined);
      assert.ok(pagina.buscar('p').some(p => pagina.texto(p).includes('No hay clases asignadas para el semestre 1.')));
      pagina.boton('3').props.onClick(); pagina.renderizar();
      assert.equal(pagina.componente('CalendarioResultados')?.props.resultado, reservado);
      assert.deepEqual(pagina.componente('CalendarioResultados').props.resultado.bloquesReservadosIds, [90]);
      pagina.boton('1').props.onClick(); pagina.renderizar();
      assert.equal(pagina.componente('CalendarioResultados'), undefined);
    } finally { pagina.cerrar(); }
  }
});

test('el selector conserva Preparación sin montar contenido ni consultar resultados', async () => {
  const consultas = [];
  const pagina = await montar('./ResultadosHorariosPage.tsx', 'ConsultaResultados', {}, {
    planificaciones: async () => [{ ...resultado.planificacion, estadoPlanificacion: 'preparacion', carrera: { nombre: 'Carrera' } }],
    consultar: async (...datos) => { consultas.push(datos); return { ...resultado, bloquesReservadosIds: [90] }; },
  });
  try {
    await pagina.asentar();
    assert.ok(pagina.buscar('p').some(p => pagina.texto(p).includes('Este período está en Preparación.')));
    assert.deepEqual(pagina.buscar('ContenidoResultados'), []);
    assert.equal(pagina.componente('CalendarioResultados'), undefined);
    assert.deepEqual(consultas, []);
  } finally { pagina.cerrar(); }
});

test('una reserva parcial impide solicitar validación y guardar desde los manejadores reales', async () => {
  const reservado = { ...resultado, bloquesReservadosIds: [187] };
  const solicitudes = [];
  const pagina = await montar('./ResultadosHorariosPage.tsx', 'ContenidoResultados', { id: 2, ocupado: false, actualizarPlanificacion() {} }, {
    consultar: async () => reservado,
    validarMovimiento: async (...datos) => { solicitudes.push(['validar', ...datos]); return { valido: true, problemas: [] }; },
    mover: async (...datos) => { solicitudes.push(['mover', ...datos]); },
  });
  try {
    await pagina.asentar();
    pagina.componente('GestionSalas').props.seleccionar(sesion); pagina.renderizar();
    const calendario = pagina.componente('CalendarioResultados');
    calendario.props.movimiento.elegir(190); pagina.renderizar(); await pagina.asentar();
    await pagina.componente('ControlesMovimiento').props.confirmar(); await pagina.asentar();
    assert.deepEqual(solicitudes, []);
    assert.equal(pagina.componente('CalendarioResultados').props.resultado, reservado);
  } finally { pagina.cerrar(); }
});

test('semester buttons default to the first semester and select only one of ten ordered semesters', async () => {
  let lecturas = 0;
  const original = JSON.stringify(resultado);
  const pagina = await montar('./ResultadosHorariosPage.tsx', 'ContenidoResultados', { id: 2, ocupado: false, actualizarPlanificacion() {} }, {
    consultar: async () => { lecturas++; return resultado; },
  });
  try {
    await pagina.asentar();
    const botones = () => pagina.buscar('button').filter(b => b.props['aria-label']?.startsWith('Ver semestre '));
    assert.deepEqual(botones().map(b => pagina.texto(b)), Array.from({ length: 10 }, (_, i) => String(i + 1)));
    assert.equal(botones()[0].props['aria-pressed'], true);
    assert.equal(botones().filter(b => b.props['aria-pressed']).length, 1);
    assert.equal(pagina.buscar('select').length, 0);
    assert.equal(pagina.componente('CalendarioResultados'), undefined);
    assert.ok(pagina.buscar('p').some(p => pagina.texto(p).includes('semestre 1')));
    assert.equal(pagina.componente('GestionSalas').props.resultado, resultado);
    botones()[2].props.onClick(); pagina.renderizar();
    assert.equal(pagina.componente('CalendarioResultados').props.nivel, '3');
    assert.equal(botones()[2].props['aria-pressed'], true);
    assert.equal(botones().filter(b => b.props['aria-pressed']).length, 1);
    botones()[0].props.onClick(); pagina.renderizar();
    assert.equal(pagina.componente('CalendarioResultados'), undefined);
    assert.equal(pagina.componente('GestionSalas').props.resultado.pendientesSala, resultado.pendientesSala);
    assert.equal(lecturas, 1);
    assert.equal(JSON.stringify(resultado), original);
  } finally { pagina.cerrar(); }
});

test('semester strip keeps ten buttons in one horizontal scrollable row', async () => {
  const { readFile } = await import('node:fs/promises');
  const css = await readFile(new URL('./ResultadosHorarios.module.css', import.meta.url), 'utf8');
  assert.match(css, /\.semestres\s*\{[^}]*display:\s*flex\s*;[^}]*flex-wrap:\s*nowrap\s*;[^}]*overflow-x:\s*auto\s*;/);
});

test('calendar palette distinguishes neutral external cards, blue managed ready cards and yellow pending cards', async () => {
  const { readFile } = await import('node:fs/promises');
  const css = await readFile(new URL('./ResultadosHorarios.module.css', import.meta.url), 'utf8');
  for (const [clase, color] of [['sesionExterna', '#f3f4f6'], ['sesionLista', '#e0f2fe'], ['sesionPendiente', '#fff6ce'],
    ['disponible', '#e5f6e9'], ['sinDisponibilidad', '#fce8e6'], ['invalido', '#fce8e6'], ['tarjetaOcupada', '#fce8e6']]) {
    assert.match(css, new RegExp(`\\.${clase}[^{}]*\\{[^}]*background:\\s*${color}\\s*;`));
  }
  assert.ok(css.indexOf('.tarjetaOcupada') > css.indexOf('.sesionPendiente'));
  assert.match(css, /\.sesionExterna[^{}]*\{[^}]*border-color:\s*#6b7280;[^}]*color:\s*#374151;[^}]*opacity:\s*1/);
});

test('results calendar fixes day widths without changing the shared professor calendar styles', async () => {
  const { readFile } = await import('node:fs/promises');
  const css = await readFile(new URL('./ResultadosHorarios.module.css', import.meta.url), 'utf8');
  assert.match(css, /\.tablaResultados\s*\{[^}]*table-layout:\s*fixed\s*;/);
  assert.match(css, /\.columnaHora\s*\{[^}]*width:\s*8rem\s*;/);
  const compartido = await readFile(new URL('../mi-horario/MiHorario.module.css', import.meta.url), 'utf8');
  assert.doesNotMatch(compartido, /table-layout:\s*fixed/);
});

test('inline movement effects discard late previews and preserve validation on same-destination reselection', async () => {
  const solicitudes = [];
  let guardados = 0;
  const pagina = await montar('./ResultadosHorariosPage.tsx', 'ContenidoResultados', { id: 2, ocupado: false, actualizarPlanificacion() {} }, {
    consultar: async () => resultado, mover: async () => { guardados++; return resultado; },
    validarMovimiento(id, datos, signal) { const llamada = { ...diferida(), id, datos, signal }; solicitudes.push(llamada); return llamada.promesa; },
  });
  try {
    await pagina.asentar(); pagina.boton('3').props.onClick(); pagina.renderizar();
    pagina.boton('Editar horario').props.onClick(); pagina.renderizar();
    pagina.componente('CalendarioResultados').props.seleccionar(sesion); pagina.renderizar();
    const elegir = id => { pagina.componente('CalendarioResultados').props.movimiento.elegir(id); pagina.renderizar(); };
    elegir(190); elegir(184); elegir(190);
    assert.equal(solicitudes.length, 3);
    assert.equal(solicitudes[0].signal.aborted, true);
    solicitudes[0].resolver({ valido: true, problemas: [] }); await pagina.asentar();
    assert.equal(pagina.componente('ControlesMovimiento').props.aprobado, false);
    solicitudes[2].resolver({ valido: true, problemas: [] }); await pagina.asentar();
    assert.equal(pagina.componente('ControlesMovimiento').props.aprobado, true);
    elegir(190);
    assert.equal(solicitudes.length, 3);
    assert.equal(pagina.componente('ControlesMovimiento').props.aprobado, true);
    solicitudes[1].rechazar(new Error('Obsolete preview')); await pagina.asentar();
    assert.equal(pagina.componente('ControlesMovimiento').props.aprobado, true);
    elegir(178);
    assert.equal(pagina.componente('ControlesMovimiento').props.aprobado, false);
    pagina.componente('ControlesMovimiento').props.confirmar();
    assert.equal(guardados, 0);
    assert.equal(solicitudes.length, 3);
    pagina.componente('ControlesMovimiento').props.cambiarGrupo(1); pagina.renderizar();
    elegir(184); solicitudes.at(-1).resolver({ valido: false, problemas: [{ codigo: 'nivel', mensaje: 'Conflicto del mismo nivel.' }] });
    await pagina.asentar();
    assert.equal(pagina.componente('ControlesMovimiento').props.aprobado, false);
    assert.equal(pagina.componente('ControlesMovimiento').props.validacion.problemas[0].mensaje, 'Conflicto del mismo nivel.');
    assert.equal(pagina.componente('CalendarioResultados').props.movimiento.invalido, true);
  } finally { pagina.cerrar(); }
});

for (const tipo of ['rejected', 'unknown']) test(`real save locks duplicate submissions and reconciles ${tipo} outcomes before editing`, async () => {
  const lecturas = [], escrituras = [];
  const pagina = await montar('./ResultadosHorariosPage.tsx', 'ContenidoResultados', { id: 2, ocupado: false, actualizarPlanificacion() {} }, {
    consultar() { const llamada = diferida(); lecturas.push(llamada); return llamada.promesa; },
    validarMovimiento: async () => ({ valido: true, problemas: [] }),
    mover(id, datos) { const llamada = { ...diferida(), id, datos }; escrituras.push(llamada); return llamada.promesa; },
  });
  try {
    lecturas[0].resolver(resultado); await pagina.asentar();
    pagina.boton('3').props.onClick(); pagina.renderizar();
    pagina.boton('Editar horario').props.onClick(); pagina.renderizar();
    pagina.componente('CalendarioResultados').props.seleccionar(sesion); pagina.renderizar();
    pagina.componente('ControlesMovimiento').props.cambiarGrupo(1); pagina.renderizar();
    pagina.componente('CalendarioResultados').props.movimiento.elegir(190); pagina.renderizar(); await pagina.asentar();
    const confirmar = pagina.componente('ControlesMovimiento').props.confirmar;
    confirmar(); confirmar(); pagina.renderizar();
    assert.equal(escrituras.length, 1);
    assert.equal(pagina.componente('CalendarioResultados').props.resultado, resultado);
    assert.equal(pagina.componente('ControlesMovimiento').props.ocupado, true);
    assert.equal(pagina.buscar('button').filter(b => b.props['aria-label']?.startsWith('Ver semestre ')).every(b => b.props.disabled), true);
    const { ApiError } = await import('../../lib/api.ts');
    escrituras[0].rechazar(tipo === 'rejected' ? new ApiError('La revisión cambió.', 409) : new Error('Respuesta perdida'));
    await pagina.asentar();
    assert.equal(lecturas.length, 2);
    assert.equal(pagina.componente('CalendarioResultados'), undefined);
    assert.equal(pagina.componente('ControlesMovimiento'), undefined);
    assert.ok(pagina.avisos.some(aviso => aviso.tipo === 'error' && aviso.mensaje === 'No pudimos confirmar el cambio. Estamos revisando el horario.'));
    assert.equal(pagina.avisos.some(aviso => /Respuesta perdida|La revisión cambió/.test(aviso.mensaje)), false);
    assert.equal(pagina.buscar('p').some(p => pagina.texto(p).includes('No pudimos confirmar el cambio')), false);
    lecturas[1].resolver(resultado); await pagina.asentar();
    assert.equal(pagina.componente('CalendarioResultados').props.resultado, resultado);
    assert.equal(resultado.sesiones[0].bloquesIds[0], 90);
  } finally { pagina.cerrar(); }
});

test('la consulta entrega el nombre de la carrera seleccionada al contenido del horario', async () => {
  const planificacion = { ...resultado.planificacion, carrera: { nombre: 'Ingeniería Civil en Informática' } };
  const pagina = await montar('./ResultadosHorariosPage.tsx', 'ConsultaResultados', {}, {
    planificaciones: async () => [planificacion],
  });
  try {
    await pagina.asentar();
    assert.equal(pagina.componente('ContenidoResultados').props.nombreCarrera, planificacion.carrera.nombre);
  } finally { pagina.cerrar(); }
});

test('las solicitudes completas y pendientes se descargan con la carrera y el período seleccionado', async () => {
  const documento = globalThis.document;
  const descargas = [];
  globalThis.document = { body: { append() {} }, createElement: () => ({ click() { descargas.push(this.download); }, remove() {} }) };
  try {
    for (const [nombreCarrera, codigo] of [['Ingeniería Civil en Informática', '2100-2'], ['Ingeniería Comercial', '2027-1']]) {
      const contexto = { ...resultado, planificacion: { ...resultado.planificacion, codigo } };
      const original = JSON.stringify(contexto);
      const solicitudes = [];
      const pagina = await montar('./ResultadosHorariosPage.tsx', 'ContenidoResultados', {
        id: contexto.planificacion.id, nombreCarrera, ocupado: false, actualizarPlanificacion() {},
      }, {
        consultar: async () => contexto,
        exportar: async (id, soloPendientes, signal) => {
          solicitudes.push({ id, soloPendientes }); assert.ok(signal instanceof AbortSignal);
          return new Blob(['solicitud']);
        },
      });
      try {
        await pagina.asentar();
        for (const soloPendientes of [false, true]) {
          await pagina.componente('GestionSalas').props.exportar(soloPendientes); await pagina.asentar();
          assert.equal(descargas.at(-1), `Solicitud de salas - ${nombreCarrera} - ${codigo}${soloPendientes ? ' - pendientes' : ''}.xlsx`);
        }
        assert.deepEqual(solicitudes, [{ id: contexto.planificacion.id, soloPendientes: false }, { id: contexto.planificacion.id, soloPendientes: true }]);
        assert.equal(JSON.stringify(contexto), original);
      } finally { pagina.cerrar(); }
    }
    assert.equal(descargas.length, 4);
  } finally {
    if (documento === undefined) delete globalThis.document; else globalThis.document = documento;
  }
});

for (const etapa of ['fetch', 'body']) test(`room export can cancel a pending ${etapa} without unlocking a later write or downloading stale data`, async () => {
  const { resultadosHorariosApi } = await import('./resultados-horarios.api.ts');
  const anterior = globalThis.fetch;
  const documento = globalThis.document;
  const solicitudes = [];
  const importacion = diferida();
  const original = JSON.stringify(resultado);
  let descargas = 0;
  globalThis.document = { body: { append() {} }, createElement: () => ({ click() { descargas++; }, remove() {} }) };
  globalThis.fetch = async (_url, opciones) => {
    const llamada = { ...diferida(), signal: opciones.signal };
    solicitudes.push(llamada);
    // Intentionally ignore abort to exercise late results from an obsolete export.
    return etapa === 'fetch' ? llamada.promesa : { ok: true, blob: () => llamada.promesa };
  };
  const pagina = await montar('./ResultadosHorariosPage.tsx', 'ContenidoResultados', { id: 2, ocupado: false, actualizarPlanificacion() {} }, {
    consultar: async () => resultado, exportar: resultadosHorariosApi.exportar, importar: () => importacion.promesa,
  });
  try {
    await pagina.asentar();
    const primera = pagina.componente('GestionSalas').props.exportar(false);
    await pagina.asentar();
    assert.equal(solicitudes.length, 1);
    assert.ok(solicitudes[0].signal instanceof AbortSignal);
    assert.equal(pagina.boton('Actualizar horario').props.disabled, true);
    assert.equal(pagina.componente('GestionSalas').props.ocupado, true);
    const cancelar = pagina.boton('Cancelar descarga');
    assert.ok(cancelar); assert.notEqual(cancelar.props.disabled, true);
    cancelar.props.onClick(); await pagina.asentar();
    assert.equal(solicitudes[0].signal.aborted, true);
    assert.equal(pagina.boton('Actualizar horario').props.disabled, false);
    assert.equal(pagina.boton('Cancelar descarga'), undefined);
    assert.ok(pagina.avisos.some(aviso => aviso.tipo === 'advertencia' && aviso.mensaje === 'Descarga cancelada.'));
    assert.equal(pagina.buscar('p').some(p => pagina.texto(p).includes('Descarga cancelada')), false);
    pagina.componente('GestionSalas').props.importar(new File(['respuesta'], 'respuesta.xlsx'));
    pagina.renderizar();
    assert.equal(pagina.componente('GestionSalas').props.ocupado, true);
    const archivo = new Blob(['solicitud']);
    solicitudes[0].resolver(etapa === 'fetch' ? { ok: true, blob: async () => archivo } : archivo);
    await primera; await pagina.asentar();
    assert.equal(descargas, 0);
    assert.equal(pagina.boton('Actualizar horario').props.disabled, true);
    importacion.resolver({ actualizadas: 1, pendientes: 0 });
    await pagina.asentar(); await pagina.asentar();
    assert.equal(pagina.componente('GestionSalas').props.ocupado, false);
    const segunda = pagina.componente('GestionSalas').props.exportar(true);
    await pagina.asentar();
    assert.equal(solicitudes.length, 2);
    assert.notEqual(solicitudes[1].signal, solicitudes[0].signal);
    solicitudes[1].resolver(etapa === 'fetch' ? { ok: true, blob: async () => archivo } : archivo);
    await segunda; await pagina.asentar();
    assert.equal(descargas, 1);
    assert.equal(pagina.avisos.filter(aviso => aviso.tipo === 'exito' && aviso.mensaje === 'La solicitud de salas está lista.').length, 1);
    assert.equal(pagina.avisos.filter(aviso => aviso.tipo === 'exito' && aviso.mensaje.startsWith('Archivo importado.')).length, 0);
    assert.equal(pagina.componente('Dialogo').props.titulo, 'Asignaturas sin sala');
    assert.equal(pagina.buscar('p').some(p => pagina.texto(p).includes('La solicitud de salas está lista.')), false);
    assert.equal(pagina.boton('Cancelar descarga'), undefined);
    assert.equal(pagina.boton('Actualizar horario').props.disabled, false);
    assert.equal(JSON.stringify(resultado), original);
  } finally {
    pagina.cerrar(); globalThis.fetch = anterior;
    if (documento === undefined) delete globalThis.document; else globalThis.document = documento;
  }
});

test('leaving the results page aborts an export and ignores its late completion', async () => {
  const llamada = diferida();
  const cambios = [];
  let signal;
  const pagina = await montar('./ResultadosHorariosPage.tsx', 'ContenidoResultados', {
    id: 2, ocupado: false, actualizarPlanificacion() {}, cambiarOcupado: valor => cambios.push(valor),
  }, {
    consultar: async () => resultado,
    exportar(_id, _pendientes, recibida) { signal = recibida; return llamada.promesa; },
  });
  try {
    await pagina.asentar();
    const exportacion = pagina.componente('GestionSalas').props.exportar(false);
    assert.deepEqual(cambios, [true]);
    pagina.cerrar();
    assert.equal(signal?.aborted, true);
    llamada.resolver(new Blob(['solicitud'])); await exportacion;
    assert.deepEqual(cambios, [true]);
  } finally { pagina.cerrar(); }
});

test('a lost publication response reconciles the real parent selector and child read-only state', async () => {
  const planificacion = { ...resultado.planificacion, carrera: { nombre: 'Carrera sintética' } };
  const publicado = { ...resultado, revision: 'b'.repeat(64), planificacion: { ...resultado.planificacion, estadoPlanificacion: 'publicado' } };
  const original = JSON.stringify(resultado);
  let escrituras = 0; let lecturas = 0;
  const padre = await montar('./ResultadosHorariosPage.tsx', 'ConsultaResultados', {}, {
    planificaciones: async () => [planificacion],
  });
  let pagina;
  try {
    await padre.asentar();
    const propiedades = { ...padre.componente('ContenidoResultados').props };
    const cambiarOcupado = propiedades.cambiarOcupado;
    propiedades.cambiarOcupado = valor => { propiedades.ocupado = valor; cambiarOcupado(valor); };
    pagina = await montar('./ResultadosHorariosPage.tsx', 'ContenidoResultados', propiedades, {
      consultar: async () => ++lecturas === 1 ? resultado : publicado,
      publicar: async () => { escrituras++; throw new Error('Respuesta perdida después de publicar'); },
    });
    await pagina.asentar(); padre.renderizar();
    const opcion = () => padre.buscar('option').find(o => o.props.value === 2);
    assert.match(padre.texto(opcion()), /Propuesta/);
    pagina.boton('Revisar y publicar').props.onClick(); pagina.renderizar();
    pagina.componente('PublicacionDialogo').props.confirmar(resultado.revision);
    await pagina.asentar(); await pagina.asentar(); padre.renderizar();
    assert.equal(escrituras, 1); assert.equal(lecturas, 2);
    assert.match(padre.texto(opcion()), /Publicado/);
    assert.doesNotMatch(padre.texto(opcion()), /Propuesta/);
    assert.ok(pagina.buscar('span').some(p => pagina.texto(p) === 'Estado: Publicado'));
    assert.equal(pagina.boton('Revisar y publicar'), undefined);
    assert.equal(pagina.componente('PublicacionDialogo'), undefined);
    assert.equal(pagina.componente('GestionSalas').props.resultado.planificacion.estadoPlanificacion, 'publicado');
    assert.equal(padre.buscar('select')[0].props.disabled, false);
    assert.equal(JSON.stringify(resultado), original);
  } finally { pagina?.cerrar(); padre.cerrar(); }
});

for (const etapa of ['fetch', 'body']) test(`obsolete ${etapa} failure preserves the newer export lock`, async () => {
  const { resultadosHorariosApi } = await import('./resultados-horarios.api.ts');
  const anterior = globalThis.fetch;
  const vieja = diferida(); const nueva = diferida();
  let llamadas = 0;
  globalThis.fetch = async () => {
    const respuesta = ++llamadas === 1 ? vieja : nueva;
    return etapa === 'fetch' ? respuesta.promesa : { ok: true, blob: () => respuesta.promesa };
  };
  const pagina = await montar('./ResultadosHorariosPage.tsx', 'ContenidoResultados', {
    id: 2, ocupado: false, actualizarPlanificacion() {},
  }, { consultar: async () => resultado, exportar: resultadosHorariosApi.exportar });
  try {
    await pagina.asentar();
    const primera = pagina.componente('GestionSalas').props.exportar(false);
    await pagina.asentar(); pagina.boton('Cancelar descarga').props.onClick(); pagina.renderizar();
    const segunda = pagina.componente('GestionSalas').props.exportar(true);
    vieja.rechazar(new Error('Error obsoleto')); await primera; await pagina.asentar();
    assert.equal(pagina.boton('Actualizar horario').props.disabled, true);
    assert.ok(pagina.buscar('p').some(p => pagina.texto(p) === 'Descargando solicitud de salas…'));
    assert.equal(pagina.buscar('p').some(p => pagina.texto(p) === 'Error obsoleto'), false);
    assert.equal(pagina.avisos.some(aviso => aviso.mensaje === 'Error obsoleto'), false);
    pagina.boton('Cancelar descarga').props.onClick();
    nueva.rechazar(new Error('Cancelada')); await segunda; await pagina.asentar();
    assert.equal(pagina.boton('Actualizar horario').props.disabled, false);
  } finally { pagina.cerrar(); globalThis.fetch = anterior; }
});

test('metadata sync ignores callback churn and wrong-plan reads', async () => {
  let lecturas = 0; const metadatos = [];
  const propiedades = { id: 2, ocupado: false, actualizarPlanificacion: datos => metadatos.push(datos) };
  const pagina = await montar('./ResultadosHorariosPage.tsx', 'ContenidoResultados', propiedades, {
    consultar: async () => { lecturas++; return resultado; },
  });
  try {
    await pagina.asentar(); assert.equal(metadatos.length, 1);
    for (let i = 0; i < 3; i++) {
      propiedades.actualizarPlanificacion = datos => metadatos.push(datos); await pagina.asentar();
    }
    assert.equal(lecturas, 1); assert.equal(metadatos.length, 1);
  } finally { pagina.cerrar(); }
  const otra = await montar('./ResultadosHorariosPage.tsx', 'ContenidoResultados', propiedades, {
    consultar: async () => ({ ...resultado, planificacion: { ...resultado.planificacion, id: 99 } }),
  });
  try { await otra.asentar(); assert.equal(metadatos.length, 1); }
  finally { otra.cerrar(); }
});

test('an obsolete read never updates parent planning metadata', async () => {
  const llamada = diferida(); const metadatos = [];
  const pagina = await montar('./ResultadosHorariosPage.tsx', 'ContenidoResultados', {
    id: 2, ocupado: false, actualizarPlanificacion: datos => metadatos.push(datos),
  }, { consultar: () => llamada.promesa });
  pagina.cerrar(); llamada.resolver(resultado);
  for (let i = 0; i < 5; i++) await Promise.resolve();
  assert.deepEqual(metadatos, []);
});

test('successful publication refreshes metadata and removes mutation controls without another write', async () => {
  const llamada = diferida();
  const metadatos = [];
  let escrituras = 0;
  const pagina = await montar('./ResultadosHorariosPage.tsx', 'ContenidoResultados', { id: 2, ocupado: false, actualizarPlanificacion: p => metadatos.push(p) }, {
    consultar: async () => resultado,
    publicar() { escrituras++; return llamada.promesa; },
  });
  try {
    await pagina.asentar(); pagina.boton('3').props.onClick(); pagina.renderizar();
    pagina.boton('Revisar y publicar').props.onClick(); pagina.renderizar();
    const confirmar = pagina.componente('PublicacionDialogo').props.confirmar;
    confirmar(resultado.revision); confirmar(resultado.revision); pagina.renderizar();
    assert.equal(escrituras, 1);
    llamada.resolver({ ...resultado, revision: 'b'.repeat(64), planificacion: { ...resultado.planificacion, estadoPlanificacion: 'publicado' }, sesiones: [{ ...sesion, editable: false }] });
    await pagina.asentar();
    assert.equal(pagina.boton('Revisar y publicar'), undefined);
    assert.equal(pagina.componente('PublicacionDialogo'), undefined);
    assert.equal(pagina.componente('GestionSalas').props.resultado.planificacion.estadoPlanificacion, 'publicado');
    assert.equal(metadatos.at(-1).estadoPlanificacion, 'publicado');
    assert.equal(pagina.avisos.filter(aviso => aviso.tipo === 'exito' && aviso.mensaje === 'Horario publicado. Ya no se puede editar.').length, 1);
    assert.equal(pagina.buscar('p').some(p => pagina.texto(p).startsWith('Horario publicado.')), false);
    pagina.boton('1').props.onClick(); pagina.renderizar();
    assert.equal(pagina.componente('CalendarioResultados'), undefined);
    pagina.boton('3').props.onClick(); pagina.renderizar();
    assert.equal(pagina.componente('CalendarioResultados').props.nivel, '3');
    assert.equal(escrituras, 1);
  } finally { pagina.cerrar(); }
});

test('active export failures use a shared error notice instead of an embedded outcome card', async () => {
  const original = JSON.stringify(resultado);
  const pagina = await montar('./ResultadosHorariosPage.tsx', 'ContenidoResultados', { id: 2, ocupado: false, actualizarPlanificacion() {} }, {
    consultar: async () => resultado, exportar: async () => { throw new Error('Failed to fetch'); },
  });
  try {
    await pagina.asentar(); await pagina.componente('GestionSalas').props.exportar(false); await pagina.asentar();
    assert.equal(pagina.avisos.length, 1);
    assert.equal(pagina.avisos[0].tipo, 'error');
    assert.equal(pagina.avisos[0].mensaje, 'No pudimos descargar el archivo. Intenta de nuevo.');
    assert.equal(pagina.avisos.some(aviso => aviso.mensaje.includes('Failed to fetch')), false);
    assert.equal(pagina.buscar('p').some(p => pagina.texto(p) === pagina.avisos[0].mensaje), false);
    assert.equal(pagina.boton('Actualizar horario').props.disabled, false);
    assert.equal(pagina.boton('Cancelar descarga'), undefined);
    assert.equal(JSON.stringify(resultado), original);
  } finally { pagina.cerrar(); }
});

test('page-owned notices are replaced by new operations and dismissed on manual refresh or exit', async () => {
  const completo = { ...resultado, pendientesSala: 0, sesiones: [] };
  const pagina = await montar('./ResultadosHorariosPage.tsx', 'ContenidoResultados', { id: 2, ocupado: false, actualizarPlanificacion() {} }, {
    consultar: async () => completo,
    importar: async () => ({ actualizadas: 1, pendientes: 0 }),
    exportar: async () => { throw new Error('Descarga no disponible.'); },
  });
  try {
    await pagina.asentar();
    const importar = () => pagina.componente('GestionSalas').props.importar(new File(['respuesta'], 'respuesta.xlsx'));
    importar(); await pagina.asentar(); await pagina.asentar();
    assert.equal(pagina.avisos.length, 1);
    assert.equal(pagina.avisos[0].tipo, 'exito');
    assert.equal(pagina.avisos[0].mensaje, 'Archivo importado. Se actualizó 1 sesión.');
    const primera = pagina.avisos[0].id;
    assert.equal(pagina.buscar('p').some(p => pagina.texto(p).startsWith('Archivo importado.')), false);
    await pagina.componente('GestionSalas').props.exportar(false); await pagina.asentar();
    assert.deepEqual(pagina.avisosCerrados, [primera]);
    const segunda = pagina.avisos[1].id;
    assert.notEqual(primera, segunda);
    pagina.boton('Actualizar horario').props.onClick(); pagina.renderizar(); await pagina.asentar();
    assert.deepEqual(pagina.avisosCerrados, [primera, segunda]);
    importar(); await pagina.asentar(); await pagina.asentar();
    const tercera = pagina.avisos[2].id;
    pagina.cerrar();
    assert.deepEqual(pagina.avisosCerrados, [primera, segunda, tercera]);
    assert.equal(pagina.avisosCerrados.every(id => typeof id === 'string' || typeof id === 'number'), true);
  } finally { pagina.cerrar(); }
});

for (const caso of [
  { actualizadas: 0, pendientes: 0, mensaje: 'Archivo importado. No hubo cambios.' },
  { actualizadas: 1, pendientes: 0, mensaje: 'Archivo importado. Se actualizó 1 sesión.' },
  { actualizadas: 2, pendientes: 0, mensaje: 'Archivo importado. Se actualizaron 2 sesiones.' },
  { actualizadas: 0, pendientes: 0, omitidas: 3, mensaje: 'Archivo importado. No hubo cambios. Se omitieron 3 sesiones que ya tenían sala.' },
  { actualizadas: 1, pendientes: 0, omitidas: 1, mensaje: 'Archivo importado. Se actualizó 1 sesión. Se omitió 1 sesión que ya tenía sala.' },
]) test(`import notices use natural counts for ${caso.actualizadas} updated, ${caso.pendientes} pending and ${caso.omitidas ?? 0} skipped sessions`, async () => {
  const completo = { ...resultado, pendientesSala: 0, sesiones: [] };
  const pagina = await montar('./ResultadosHorariosPage.tsx', 'ContenidoResultados', { id: 2, ocupado: false, actualizarPlanificacion() {} }, {
    consultar: async () => completo, importar: async () => caso,
  });
  try {
    await pagina.asentar();
    pagina.componente('GestionSalas').props.importar(new File(['respuesta'], 'respuesta.xlsx'));
    await pagina.asentar(); await pagina.asentar();
    assert.equal(pagina.avisos.length, 1);
    assert.equal(pagina.avisos[0].tipo, 'exito'); assert.equal(pagina.avisos[0].mensaje, caso.mensaje);
    assert.equal(pagina.buscar('p').some(p => pagina.texto(p) === caso.mensaje), false);
    assert.equal(pagina.componente('GestionSalas').props.resultado.pendientesSala, 0);
    assert.equal(pagina.componente('Dialogo'), undefined);
  } finally { pagina.cerrar(); }
});

test('an import completion after leaving the page cannot emit a notification', async () => {
  const llamada = diferida();
  const pagina = await montar('./ResultadosHorariosPage.tsx', 'ContenidoResultados', { id: 2, ocupado: false, actualizarPlanificacion() {} }, {
    consultar: async () => resultado, importar: () => llamada.promesa,
  });
  await pagina.asentar();
  pagina.componente('GestionSalas').props.importar(new File(['respuesta'], 'respuesta.xlsx'));
  pagina.cerrar(); llamada.resolver({ actualizadas: 1, pendientes: 0 });
  for (let i = 0; i < 10; i++) await Promise.resolve();
  assert.deepEqual(pagina.avisos, []); assert.deepEqual(pagina.avisosCerrados, []);
});

test('a result read failure keeps its inline retry without producing an operation toast', async () => {
  let lecturas = 0;
  const pagina = await montar('./ResultadosHorariosPage.tsx', 'ContenidoResultados', { id: 2, ocupado: false, actualizarPlanificacion() {} }, {
    consultar: async () => { if (++lecturas === 1) throw new Error('No se pudo consultar el horario.'); return resultado; },
  });
  try {
    await pagina.asentar();
    assert.ok(pagina.buscar('p').some(p => p.props.role === 'alert' && pagina.texto(p) === 'No se pudo consultar el horario.'));
    assert.deepEqual(pagina.avisos, []);
    pagina.boton('Reintentar consulta').props.onClick(); pagina.renderizar(); await pagina.asentar();
    assert.equal(pagina.componente('GestionSalas').props.resultado, resultado);
    assert.equal(lecturas, 2); assert.deepEqual(pagina.avisos, []);
  } finally { pagina.cerrar(); }
});

test('los errores de planilla abren un diálogo sin notificación ni desmontar el formulario', async () => {
  const { ApiError } = await import('../../lib/api.ts');
  let lecturas = 0;
  const pagina = await montar('./ResultadosHorariosPage.tsx', 'ContenidoResultados', { id: 2, ocupado: false, actualizarPlanificacion() {} }, {
    consultar: async () => { lecturas++; return resultado; },
    importar: async () => { throw new ApiError('Planilla inválida', 400, { errores: [
      { fila: 4, columna: 'Sala', mensaje: 'Sala desconocida' },
      { fila: 24, columna: 'Sala 1', mensaje: 'Celda vacía. Indique una sala válida o escriba «SIN SALA».' },
    ] }); },
  });
  try {
    await pagina.asentar(); pagina.componente('GestionSalas').props.importar(new File(['file'], 'respuesta.xlsx'));
    await pagina.asentar(); await pagina.asentar();
    assert.ok(pagina.buscar('td').some(td => pagina.texto(td) === '4'));
    assert.ok(pagina.buscar('td').some(td => pagina.texto(td) === 'Sala desconocida'));
    assert.ok(pagina.buscar('td').some(td => pagina.texto(td) === 'Celda vacía. Indique una sala válida o escriba «SIN SALA».'));
    assert.ok(pagina.buscar('td').some(td => pagina.texto(td) === '24'));
    assert.equal(pagina.componente('GestionSalas').props.resultado, resultado);
    assert.equal(pagina.componente('Dialogo').props.titulo, 'No se pudo importar la respuesta');
    assert.ok(pagina.buscar('p').some(p => pagina.texto(p) === 'No se guardó ningún cambio. Corrige la planilla y vuelve a importarla.'));
    assert.equal(pagina.avisos.length, 0);
    assert.equal(lecturas, 1);
    assert.equal(pagina.buscar('p').some(p => pagina.texto(p).includes('No pudimos confirmar el cambio')), false);
    pagina.componente('Dialogo').props.cerrar(); pagina.renderizar();
    assert.equal(pagina.componente('Dialogo'), undefined);
    assert.equal(pagina.buscar('td').some(td => pagina.texto(td) === 'Sala desconocida'), false);
  } finally { pagina.cerrar(); }
});

test('el diálogo de pendientes espera la consulta actualizada e incluye sesiones de todos los niveles', async () => {
  const segunda = { ...sesion, idsHorarios: [21, 22], asignatura: { codigo: '200', nombre: 'Economía', semestreMalla: 5 }, seccion: 2, dia: 'Martes', tipoHora: { id: 2, tipo: 'Práctica' } };
  const nuevo = { ...resultado, revision: 'b'.repeat(64), sesiones: [sesion, segunda, { ...sesion, idsHorarios: [31], estadoSala: 'externa' }], pendientesSala: 2 };
  const consulta = diferida(); let lecturas = 0;
  const pagina = await montar('./ResultadosHorariosPage.tsx', 'ContenidoResultados', { id: 2, ocupado: false, actualizarPlanificacion() {} }, {
    consultar: () => ++lecturas === 1 ? Promise.resolve(resultado) : consulta.promesa,
    importar: async () => ({ actualizadas: 25, pendientes: 0, omitidas: 2 }),
  });
  try {
    await pagina.asentar(); pagina.componente('GestionSalas').props.importar(new File(['respuesta'], 'respuesta.xlsx'));
    await pagina.asentar();
    assert.equal(pagina.componente('Dialogo'), undefined); assert.deepEqual(pagina.avisos, []);
    consulta.resolver(nuevo); await pagina.asentar();
    assert.equal(pagina.componente('Dialogo').props.titulo, 'Asignaturas sin sala');
    const lista = pagina.buscar('ul').find(ul => ul.props['aria-label'] === 'Sesiones sin sala');
    assert.ok(lista); assert.equal(pagina.buscar('li', lista).length, 2);
    assert.equal(pagina.buscar('article', lista).length, 2);
    assert.ok(pagina.buscar('p').some(p => pagina.texto(p).startsWith('La respuesta se importó.')));
    assert.ok(pagina.buscar('p').some(p => pagina.texto(p) === 'Se omitieron 2 sesiones que ya tenían sala.'));
    assert.match(pagina.texto(lista), /100.*Estructuras de Datos.*Semestre 3.*Sección 1.*Lunes/);
    assert.match(pagina.texto(lista), /200.*Economía.*Semestre 5.*Sección 2.*Práctica.*Martes/);
    assert.deepEqual(pagina.avisos, []);
    pagina.componente('Dialogo').props.cerrar(); pagina.renderizar();
    assert.equal(pagina.componente('Dialogo'), undefined);
  } finally { pagina.cerrar(); }
});

test('un fallo de red al importar abre un diálogo sin afirmar que hubo reversión', async () => {
  let lecturas = 0;
  const pagina = await montar('./ResultadosHorariosPage.tsx', 'ContenidoResultados', { id: 2, ocupado: false, actualizarPlanificacion() {} }, {
    consultar: async () => { lecturas++; return resultado; }, importar: async () => { throw new Error('Failed to fetch'); },
  });
  try {
    await pagina.asentar(); pagina.componente('GestionSalas').props.importar(new File(['respuesta'], 'respuesta.xlsx'));
    await pagina.asentar(); await pagina.asentar();
    assert.equal(pagina.componente('Dialogo').props.titulo, 'No pudimos confirmar la importación');
    assert.equal(pagina.buscar('p').some(p => pagina.texto(p).includes('No se guardó ningún cambio')), false);
    assert.deepEqual(pagina.avisos, []); assert.equal(lecturas, 2);
  } finally { pagina.cerrar(); }
});

test('una importación confirmada con consulta fallida permite revisar el estado sin reenviar el archivo', async () => {
  let lecturas = 0; let importaciones = 0;
  const pagina = await montar('./ResultadosHorariosPage.tsx', 'ContenidoResultados', { id: 2, ocupado: false, actualizarPlanificacion() {} }, {
    consultar: async () => { lecturas++; if (lecturas === 2) throw new Error('Lectura fallida'); return { ...resultado, pendientesSala: 0, sesiones: [] }; },
    importar: async () => { importaciones++; return { actualizadas: 25, pendientes: 0 }; },
  });
  try {
    await pagina.asentar(); pagina.componente('GestionSalas').props.importar(new File(['respuesta'], 'respuesta.xlsx'));
    await pagina.asentar(); await pagina.asentar();
    assert.equal(pagina.componente('Dialogo').props.titulo, 'Revisar el resultado de la importación');
    assert.deepEqual(pagina.avisos, []);
    pagina.componente('Dialogo').props.cerrar(); pagina.renderizar();
    pagina.boton('Reintentar consulta').props.onClick(); await pagina.asentar();
    assert.equal(importaciones, 1); assert.equal(lecturas, 3);
    assert.equal(pagina.componente('Dialogo'), undefined);
    assert.equal(pagina.avisos[0].mensaje, 'Archivo importado. Se actualizaron 25 sesiones.');
  } finally { pagina.cerrar(); }
});

test('a successful unfiltered movement keeps the selected level and updates only confirmed data', async () => {
  const llamada = diferida();
  const pagina = await montar('./ResultadosHorariosPage.tsx', 'ContenidoResultados', { id: 2, ocupado: false, actualizarPlanificacion() {} }, {
    consultar: async () => resultado, mover: () => llamada.promesa, validarMovimiento: async () => ({ valido: true, problemas: [] }),
  });
  try {
    await pagina.asentar(); pagina.boton('3').props.onClick(); pagina.renderizar();
    pagina.boton('Editar horario').props.onClick(); pagina.renderizar();
    pagina.componente('CalendarioResultados').props.seleccionar(sesion); pagina.renderizar();
    pagina.componente('ControlesMovimiento').props.cambiarGrupo(1); pagina.renderizar();
    pagina.componente('CalendarioResultados').props.movimiento.elegir(190); pagina.renderizar(); await pagina.asentar();
    pagina.componente('ControlesMovimiento').props.confirmar(); pagina.renderizar();
    assert.equal(pagina.componente('CalendarioResultados').props.resultado, resultado);
    const actualizado = { ...resultado, revision: 'b'.repeat(64), sesiones: [
      { ...sesion, bloquesIds: [84, 81, 78, 75] },
      { ...sesion, ofertaId: 8, asignatura: { ...sesion.asignatura, semestreMalla: 5 } },
    ] };
    llamada.resolver(actualizado); await pagina.asentar();
    assert.equal(pagina.avisos.filter(aviso => aviso.tipo === 'exito' && aviso.mensaje === 'Horario actualizado.').length, 1);
    assert.equal(pagina.buscar('p').some(p => pagina.texto(p) === 'Horario actualizado.'), false);
    assert.equal(pagina.componente('CalendarioResultados').props.nivel, '3');
    assert.equal(pagina.componente('CalendarioResultados').props.resultado, actualizado);
    assert.equal(pagina.componente('ControlesMovimiento'), undefined);
  } finally { pagina.cerrar(); }
});

test('publication groups per-block missing rooms into session details across all semesters', async () => {
  const primera = { ...sesion, idsHorarios: [11, 12, 13], bloquesIds: [90, 87, 84], horaTermino: '10:20', salas: [null, null, null] };
  const segunda = { ...primera, idsHorarios: [21, 22, 23], bloquesIds: [190, 187, 184], ofertaId: 6, seccion: 2, dia: 'Martes',
    asignatura: { codigo: '200', nombre: 'Economía', semestreMalla: 5 }, tipoHora: { id: 2, tipo: 'Práctica' } };
  const contexto = { ...resultado, sesiones: [primera, segunda], pendientesSala: 2 };
  const original = JSON.stringify(contexto);
  const problemas = contexto.sesiones.flatMap(s => s.idsHorarios.map(id => ({ codigo: 'sala',
    mensaje: 'Hay una clase que requiere sala sin asignación.', idsHorarios: [id], ofertaId: s.ofertaId })));
  problemas.push({ codigo: 'disponibilidad', mensaje: 'El profesor no tiene disponibilidad declarada en este bloque.', idsHorarios: [21] });
  let publicaciones = 0;
  const pagina = await montar('./PublicacionDialogo.tsx', 'PublicacionDialogo', {
    resultado: contexto, ocupado: false, cerrar() {}, confirmar() { publicaciones++; },
  }, { validarPublicacion: async () => ({ valido: false, revision: contexto.revision, problemas }) });
  try {
    await pagina.asentar();
    assert.equal(pagina.buscar('p').some(p => pagina.texto(p).startsWith('Se comprueba toda la planificación:')), false);
    assert.equal(pagina.buscar('p').some(p => pagina.texto(p).includes('Todos los horarios cargados que requieren sala')), false);
    const lista = pagina.buscar('ul').find(ul => ul.props['aria-label'] === 'Sesiones sin sala');
    assert.ok(lista);
    const filas = pagina.buscar('li', lista);
    assert.equal(filas.length, 2);
    assert.equal(pagina.buscar('article', lista).length, 2);
    assert.equal(pagina.buscar('h5', lista).length, 2);
    assert.equal(pagina.texto(filas[0]), '100 — Estructuras de DatosSemestre 3 · Sección 1 · TeóricaLunes 08:10–10:20');
    assert.equal(pagina.texto(filas[1]), '200 — EconomíaSemestre 5 · Sección 2 · PrácticaMartes 08:10–10:20');
    assert.equal(pagina.buscar('li').filter(li => pagina.texto(li) === 'Hay una clase que requiere sala sin asignación.').length, 0);
    assert.ok(pagina.buscar('li').some(li => pagina.texto(li) === problemas.at(-1).mensaje));
    assert.equal(pagina.boton('Confirmar publicación').props.disabled, true);
    pagina.boton('Confirmar publicación').props.onClick();
    assert.equal(publicaciones, 0); assert.equal(JSON.stringify(contexto), original);
  } finally { pagina.cerrar(); }
});

test('publication keeps separate sessions of one subject and retains unresolved room problems', async () => {
  const otra = { ...sesion, idsHorarios: [21, 22, 23, 24], bloquesIds: [190, 187, 184, 181], dia: 'Martes' };
  const contexto = { ...resultado, sesiones: [sesion, otra], pendientesSala: 2 };
  const mensaje = 'Hay una clase que requiere sala sin asignación.';
  const problemas = [
    { codigo: 'sala', mensaje, idsHorarios: [11, 12], ofertaId: sesion.ofertaId },
    { codigo: 'sala', mensaje, idsHorarios: [21, 22], ofertaId: sesion.ofertaId },
    { codigo: 'sala', mensaje, idsHorarios: [23, 999], ofertaId: sesion.ofertaId },
    { codigo: 'sala', mensaje, ofertaId: 99 },
  ];
  let publicaciones = 0;
  const pagina = await montar('./PublicacionDialogo.tsx', 'PublicacionDialogo', {
    resultado: contexto, ocupado: false, cerrar() {}, confirmar() { publicaciones++; },
  }, { validarPublicacion: async () => ({ valido: false, revision: contexto.revision, problemas }) });
  try {
    await pagina.asentar();
    const lista = pagina.buscar('ul').find(ul => ul.props['aria-label'] === 'Sesiones sin sala');
    assert.ok(lista);
    const filas = pagina.buscar('li', lista);
    assert.equal(filas.length, 2);
    assert.match(pagina.texto(filas[0]), /Lunes 08:10–11:00/);
    assert.match(pagina.texto(filas[1]), /Martes 08:10–11:00/);
    assert.equal(pagina.buscar('li').filter(li => pagina.texto(li) === mensaje).length, 2);
    pagina.boton('Confirmar publicación').props.onClick(); assert.equal(publicaciones, 0);
  } finally { pagina.cerrar(); }
});

test('publicación agrupa reservas por sesión y muestra los bloques afectados sin repetir mensajes', async () => {
  const otra = { ...sesion, idsHorarios: [21, 22], bloquesIds: [190, 187], dia: 'Martes', horaTermino: '09:30' };
  const contexto = { ...resultado, sesiones: [sesion, otra] };
  const mensaje = 'El bloque horario está reservado para la carrera y no admite clases.';
  const problemas = [
    { codigo: 'bloqueReservado', mensaje, idsHorarios: [11], bloqueId: 90 },
    { codigo: 'bloqueReservado', mensaje, idsHorarios: [12], bloqueId: 87 },
    { codigo: 'bloqueReservado', mensaje, idsHorarios: [21], bloqueId: 190 },
    { codigo: 'bloqueReservado', mensaje, idsHorarios: [22], bloqueId: 187 },
  ];
  const original = JSON.stringify({ contexto, problemas });
  let publicaciones = 0;
  const pagina = await montar('./PublicacionDialogo.tsx', 'PublicacionDialogo', {
    resultado: contexto, ocupado: false, cerrar() {}, confirmar() { publicaciones++; },
  }, { validarPublicacion: async () => ({ valido: false, revision: contexto.revision, problemas }) });
  try {
    await pagina.asentar();
    const lista = pagina.buscar('ul').find(ul => ul.props['aria-label'] === 'Sesiones en bloques reservados');
    assert.ok(lista);
    assert.equal(pagina.buscar('article', lista).length, 2);
    const filas = pagina.buscar('li', lista);
    assert.match(pagina.texto(filas[0]), /100 — Estructuras de DatosSemestre 3 · Sección 1 · TeóricaLunes 08:10–11:00/);
    const horariosReservados = pagina.buscar('div', filas[0]).find(div => div.props['aria-label'] === 'Horarios reservados');
    assert.ok(horariosReservados);
    assert.match(pagina.texto(horariosReservados), /Horario reservadoLunes 08:10–08:50Lunes 08:50–09:30/);
    assert.doesNotMatch(pagina.texto(lista), /Bloques reservados:|\bB\d+\b/);
    assert.match(pagina.texto(filas[1]), /Martes 08:10–09:30/);
    assert.equal(pagina.buscar('li').filter(li => pagina.texto(li) === mensaje).length, 0);
    assert.equal(pagina.boton('Confirmar publicación').props.disabled, true);
    pagina.boton('Confirmar publicación').props.onClick();
    assert.equal(publicaciones, 0);
    assert.equal(JSON.stringify({ contexto, problemas }), original);
  } finally { pagina.cerrar(); }
});

test('publicación conserva reservas no identificadas y pendientes de sala junto a sus tarjetas', async () => {
  const mensaje = 'Reserva sin sesión identificada';
  const problemas = [
    { codigo: 'sala', mensaje: 'Falta sala', idsHorarios: [11] },
    { codigo: 'bloqueReservado', mensaje, idsHorarios: [11, 999], bloqueId: 90 },
    { codigo: 'bloqueReservado', mensaje: 'Reserva sin identificadores' },
  ];
  const pagina = await montar('./PublicacionDialogo.tsx', 'PublicacionDialogo', {
    resultado, ocupado: false, cerrar() {}, confirmar() { assert.fail('No debe publicar'); },
  }, { validarPublicacion: async () => ({ valido: false, revision: resultado.revision, problemas }) });
  try {
    await pagina.asentar();
    assert.ok(pagina.buscar('ul').some(ul => ul.props['aria-label'] === 'Sesiones sin sala'));
    assert.ok(pagina.buscar('ul').some(ul => ul.props['aria-label'] === 'Sesiones en bloques reservados'));
    for (const texto of [mensaje, 'Reserva sin identificadores']) assert.ok(pagina.buscar('li').some(li => pagina.texto(li) === texto));
    assert.equal(pagina.boton('Confirmar publicación').props.disabled, true);
  } finally { pagina.cerrar(); }
});

test('a publication without blocking problems retains its revision-bound confirmation', async () => {
  const publicadas = [];
  const contexto = { ...resultado, pendientesSala: 0, sesiones: [
    { ...sesion, estadoSala: 'asignada', salas: sesion.salas.map(() => ({ id: 1, nombre: 'A-101' })) },
    { ...sesion, idsHorarios: [41, 42], estadoSala: 'laboratorio', salas: [null, null] },
  ] };
  const pagina = await montar('./PublicacionDialogo.tsx', 'PublicacionDialogo', {
    resultado: contexto, ocupado: false, cerrar() {}, confirmar: revision => publicadas.push(revision),
  }, { validarPublicacion: async () => ({ valido: true, revision: contexto.revision, problemas: [] }) });
  try {
    assert.ok(pagina.buscar('div').some(div => div.props['data-dialogo-publicacion'] === true));
    assert.equal(pagina.buscar('p').some(p => pagina.texto(p).startsWith('Se comprueba toda la planificación:')), false);
    assert.equal(pagina.buscar('p').some(p => pagina.texto(p).includes('Todos los horarios cargados que requieren sala')), false);
    await pagina.asentar();
    assert.equal(pagina.buscar('ul').length, 0);
    assert.ok(pagina.buscar('p').some(p => pagina.texto(p) === 'Todas las asignaturas que requieren sala tienen una asignada.'));
    assert.ok(pagina.buscar('p').some(p => pagina.texto(p) === 'Al publicarlo quedará en solo lectura.'));
    assert.equal(pagina.buscar('p').some(p => /El horario está listo\.|no se puede reabrir desde esta página/.test(pagina.texto(p))), false);
    assert.equal(pagina.boton('Confirmar publicación').props.disabled, false);
    pagina.boton('Confirmar publicación').props.onClick();
    assert.deepEqual(publicadas, [resultado.revision]);
  } finally { pagina.cerrar(); }
});

test('la publicación mantiene el ancho compacto incluso sin sesiones pendientes', async () => {
  const { readFile } = await import('node:fs/promises');
  const css = await readFile(new URL('./ResultadosHorarios.module.css', import.meta.url), 'utf8');
  const compacto = css.match(/\.dialogo:has\(\[data-dialogo-publicacion\]\)\s*\{([^}]+)\}/)?.[1];
  assert.ok(compacto);
  assert.match(compacto, /width:\s*min\(36rem,\s*calc\(100% - 2rem\)\)/);
  const fuente = await readFile(new URL('./PublicacionDialogo.tsx', import.meta.url), 'utf8');
  assert.match(fuente, /className=\{estilos\.tarjetasPendientes\}/);
  assert.match(fuente, /<article className=\{estilos\.tarjeta\}/);
});

test('a stale publication check never enables or invokes publication', async () => {
  const llamada = diferida();
  let publicadas = 0;
  const pagina = await montar('./PublicacionDialogo.tsx', 'PublicacionDialogo', {
    resultado, ocupado: false, cerrar() {}, confirmar() { publicadas++; },
  }, { validarPublicacion: () => llamada.promesa });
  try {
    assert.equal(pagina.boton('Confirmar publicación').props.disabled, true);
    llamada.resolver({ valido: true, problemas: [], revision: 'b'.repeat(64) }); await pagina.asentar();
    assert.equal(pagina.boton('Confirmar publicación').props.disabled, true);
    assert.equal(pagina.buscar('p').some(p => pagina.texto(p).includes('Todos los horarios cargados que requieren sala')), false);
    pagina.boton('Confirmar publicación').props.onClick();
    assert.equal(publicadas, 0);
  } finally { pagina.cerrar(); }
});

test('room upload validates extension, nonempty size and limit before submitting a workbook', async () => {
  const importados = [];
  const pagina = await montar('./GestionSalas.tsx', 'GestionSalas', {
    resultado, ocupado: false, exportar() {}, seleccionar() {}, importar: archivo => importados.push(archivo),
  }, {});
  try {
    for (const archivo of [new File(['file'], 'respuesta.csv'), new File([], 'respuesta.xlsx'), { name: 'respuesta.xlsx', size: 10 * 1024 * 1024 + 1 }]) {
      pagina.buscar('input')[0].props.onChange({ target: { files: [archivo] } }); pagina.renderizar();
      pagina.buscar('form')[0].props.onSubmit({ preventDefault() {} });
      assert.equal(importados.length, 0);
      assert.equal(pagina.boton('Importar respuesta').props.disabled, true);
    }
    const archivo = new File(['xlsx'], 'respuesta.xlsx');
    pagina.buscar('input')[0].props.onChange({ target: { files: [archivo] } }); pagina.renderizar();
    pagina.buscar('form')[0].props.onSubmit({ preventDefault() {} });
    assert.deepEqual(importados, [archivo]);
  } finally { pagina.cerrar(); }
});
