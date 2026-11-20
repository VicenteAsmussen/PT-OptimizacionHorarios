import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { abrirNavegador } from '../../../tests/soporte/navegador.mjs';

const raiz = fileURLToPath(new URL('../../../', import.meta.url));
const requerir = createRequire(new URL('../../../package.json', import.meta.url));
const { build } = createRequire(requerir.resolve('vite/package.json'))('esbuild');

// No se monta backend ni se leen .env. Las respuestas viven en memoria del navegador.
test('salas conserva una sola tarjeta tras rechazos, SIN SALA y cambios de revisión', { timeout: 90000 }, async () => {
  const compilacion = await build({ absWorkingDir: raiz, bundle: true, write: false, outdir: '/virtual', publicPath: '/',
    format: 'esm', platform: 'browser', jsx: 'automatic', logLevel: 'silent',
    define: { 'process.env.NODE_ENV': '"development"' }, loader: { '.svg': 'file', '.png': 'file', '.ttf': 'file' },
    stdin: { resolveDir: raiz, sourcefile: 'regresion-salas.tsx', loader: 'tsx', contents: `
      import { StrictMode } from 'react';
      import { createRoot } from 'react-dom/client';
      import { BrowserRouter } from 'react-router-dom';
      import { ConsultaResultados } from './src/features/resultados-horarios/ResultadosHorariosPage';
      const bloques = Array.from({ length: 6 }, (_, i) => ({ id: i + 1, dia: 'Lunes', numeroBloque: i + 1,
        horaInicio: ['08:10','08:50','09:40','10:20','11:10','11:50'][i], horaTermino: ['08:50','09:30','10:20','11:00','11:50','12:30'][i] }));
      const sesion = (id, nivel, ids) => ({ idsHorarios: ids, bloquesIds: ids, ofertaId: id,
        asignatura: { codigo: 'DEMO'+id, nombre: 'Asignatura ficticia '+id, semestreMalla: nivel },
        seccion: 1, profesor: { id, nombre: 'Docente ficticio '+id }, profesorId: id, tipoHora: { id: 1, tipo: 'Teórica' },
        dia: 'Lunes', horaInicio: bloques[ids[0]-1].horaInicio, horaTermino: bloques[ids.at(-1)-1].horaTermino,
        salas: ids.map(() => null), estadoSala: 'pendiente', editable: true });
      const planificacion = { id: 9, codigo: '2099-2', carreraId: 1, actual: true, estadoPlanificacion: 'propuesta', carrera: { id: 1, nombre: 'Carrera ficticia' } };
      const resultado = { planificacion, revision: 'a'.repeat(64), bloques, sesiones: [sesion(1,1,[1,2]),sesion(2,2,[5,6])], pendientesSala: 2,
        disponibilidades: [1,2].flatMap(profesorId => bloques.map(b => ({ profesorId, bloqueId: b.id, planificacionSemestreId: 9 }))) };
      window.modoImportacion = 'rechazo'; window.importaciones = 0; window.lecturas = 0;
      window.fetch = async (ruta, opciones = {}) => {
        const url = new URL(String(ruta), window.location.origin);
        if (url.origin !== window.location.origin) throw new Error('Destino ajeno al ensayo sintético');
        const json = data => Response.json({ status: 'success', data });
        if (url.pathname === '/api/planificaciones-semestres') return json([planificacion]);
        if (url.pathname === '/api/resultados-horarios/9') { window.lecturas++; return json(structuredClone(resultado)); }
        if (url.pathname === '/api/resultados-horarios/9/validacion-publicacion') return json({ valido: false,
          problemas: [{ codigo: 'sala', mensaje: 'La sesión requiere sala.', idsHorarios: [1,2] }] });
        if (url.pathname === '/api/resultados-horarios/9/salas/importar' && opciones.method === 'POST') {
          window.importaciones++;
          if (window.modoImportacion === 'rechazo') return Response.json({ status: 'error', errores: [
            { fila: 2, columna: 'Sala 1', mensaje: 'Celda vacía. Indique una sala válida o escriba «SIN SALA».' }] }, { status: 400 });
          if (window.modoImportacion === 'revision') resultado.revision = String(window.importaciones).repeat(64);
          return json({ actualizadas: 0, pendientes: 2, omitidas: 0 });
        }
        throw new Error('Solicitud no prevista: '+url.pathname);
      };
      createRoot(document.getElementById('root')!).render(<StrictMode><BrowserRouter><ConsultaResultados /></BrowserRouter></StrictMode>);
    ` }, plugins: [{ name: 'identidad-sintetica', setup(compilador) {
      compilador.onResolve({ filter: /\/useAuth$/ }, () => ({ path: 'identidad', namespace: 'sintetico' }));
      compilador.onLoad({ filter: /.*/, namespace: 'sintetico' }, () => ({ loader: 'js', contents:
        'export const useAuth = () => ({ usuario: { id: 1, nombre: "Secretaría ficticia", rol: "secretaria" }, cargando: false });' }));
    } }],
  });
  const archivos = new Map(compilacion.outputFiles.map(archivo => [`/${basename(archivo.path)}`, archivo.contents]));
  const servidor = createServer((peticion, respuesta) => {
    const ruta = new URL(peticion.url, 'http://localhost').pathname;
    respuesta.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'none'; img-src 'self' data:");
    if (archivos.has(ruta)) { respuesta.setHeader('Content-Type', ruta.endsWith('.js') ? 'text/javascript' : ruta.endsWith('.css') ? 'text/css' : 'image/svg+xml'); respuesta.end(archivos.get(ruta)); }
    else if (ruta === '/favicon.ico') { respuesta.writeHead(204); respuesta.end(); }
    else { respuesta.setHeader('Content-Type', 'text/html; charset=utf-8'); respuesta.end('<!doctype html><html lang="es"><meta charset="utf-8"><title>Regresión sintética de salas</title><div id="root"></div><script type="module" src="/stdin.js"></script></html>'); }
  });
  servidor.listen(0, '127.0.0.1'); await once(servidor, 'listening');
  let navegador;
  try {
    const origen = `http://127.0.0.1:${servidor.address().port}`;
    navegador = await abrirNavegador(origen);
    const { comando, evaluar, esperar } = navegador;
    await comando('Page.navigate', { url: `${origen}/app/resultados-horarios?planificacion=9` });
    await esperar('document.querySelector("#titulo-salas")');
    const unaTarjeta = async paso => {
      const conteos = await evaluar(`({ titulos: document.querySelectorAll('#titulo-salas').length,
        formularios: document.querySelectorAll('form[aria-labelledby="titulo-respuesta-salas"]').length })`);
      assert.deepEqual(conteos, { titulos: 1, formularios: 1 }, paso);
    };
    const pulsar = texto => evaluar(`Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === ${JSON.stringify(texto)}).click()`);
    const cerrarDialogo = async () => { await pulsar('Cerrar'); await esperar('!document.querySelector("dialog:modal")'); };
    await unaTarjeta('Carga inicial');
    await pulsar('Revisar y publicar'); await esperar('document.querySelector("dialog:modal")');
    await unaTarjeta('Revisión de publicación con salas pendientes'); await cerrarDialogo();
    await unaTarjeta('Cierre de revisión de publicación sin duplicar la gestión de salas');
    const archivo = join(navegador.temporal, 'respuesta.xlsx');
    // Verifica el DOM y el transporte, el análisis de Excel se prueba en el servidor.
    await writeFile(archivo, 'Contenido sintético para el selector de archivo');
    for (const modo of ['rechazo', 'sinSala', 'sinSala', 'revision', 'revision']) {
      await evaluar(`window.modoImportacion = ${JSON.stringify(modo)}`);
      const { root } = await comando('DOM.getDocument');
      const { nodeId } = await comando('DOM.querySelector', { nodeId: root.nodeId, selector: 'input[name="respuestaSalas"]' });
      await comando('DOM.setFileInputFiles', { nodeId, files: [archivo] });
      await esperar('!document.querySelector("form[aria-labelledby=titulo-respuesta-salas] button[type=submit]").disabled');
      await pulsar('Importar respuesta'); await esperar('document.querySelector("dialog:modal")');
      await unaTarjeta(`Importación ${modo}`);
      assert.ok((await evaluar('document.querySelector("dialog:modal").textContent')).includes(modo === 'rechazo' ? 'No se guardó ningún cambio' : 'Quedan 2 sesiones sin sala'));
      await cerrarDialogo(); await unaTarjeta(`Cierre ${modo}`);
    }
    assert.equal(await evaluar('window.importaciones'), 5);
    assert.deepEqual(navegador.externas, []); assert.deepEqual(navegador.errores, []);
  } finally {
    if (navegador) await navegador.cerrar();
    servidor.closeAllConnections(); await new Promise(resolve => servidor.close(resolve));
  }
});
