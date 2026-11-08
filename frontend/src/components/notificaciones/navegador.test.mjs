import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { setTimeout as pausa } from 'node:timers/promises';

const raiz = fileURLToPath(new URL('../../../', import.meta.url));
const requerir = createRequire(new URL('../../../package.json', import.meta.url));
const { build } = createRequire(requerir.resolve('vite/package.json'))('esbuild');

// Navegador real con perfil nuevo, sin sesiones, servicios ni base de datos.
test('Sonner conserva visibilidad, acceso con teclado e instancia dentro y fuera de un diálogo nativo', { timeout: 90000 }, async contexto => {
  const ejecutable = process.env.NAVEGADOR_PRUEBAS || [
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome',
  ].find(existsSync);
  if (!ejecutable) { contexto.skip('No hay Chromium/Edge instalado. Configura NAVEGADOR_PRUEBAS para ejecutar la prueba real.'); return; }
  const carpeta = await mkdtemp(join(process.env.OPENCODE_TMPDIR || tmpdir(), 'notificaciones-browser-'));
  let servidor, proceso, socket;
  let secuencia = 0;
  const pendientes = new Map();
  const errores = [];
  const solicitudesExternas = [];
  function comando(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = ++secuencia;
      const temporizador = setTimeout(() => { pendientes.delete(id); reject(new Error(`Tiempo agotado: ${method}`)); }, 8000);
      pendientes.set(id, { resolve, reject, temporizador });
      socket.send(JSON.stringify({ id, method, params }));
    });
  }
  async function evaluar(expression) {
    const respuesta = await comando('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    assert.equal(respuesta.exceptionDetails, undefined, JSON.stringify(respuesta.exceptionDetails));
    return respuesta.result.value;
  }
  async function esperar(expresion) {
    for (let intento = 0; intento < 100; intento++) {
      if (await evaluar(`Boolean(${expresion})`)) return;
      await pausa(50);
    }
    assert.fail(`No se cumplió: ${expresion}\n${JSON.stringify(errores)}\n${await evaluar('document.body?.innerText')}`);
  }
  async function tecla(key, codigo, numero) {
    await comando('Input.dispatchKeyEvent', { type: 'keyDown', key, code: codigo, windowsVirtualKeyCode: numero });
    await comando('Input.dispatchKeyEvent', { type: 'keyUp', key, code: codigo, windowsVirtualKeyCode: numero });
  }
  const aviso = 'document.querySelector("[data-sonner-toast]")';
  const cierre = `document.querySelector('[data-sonner-toast] button[aria-label="Cerrar notificación"]')`;
  try {
    const resultado = await build({
      absWorkingDir: raiz, bundle: true, write: false, outdir: join(carpeta, 'bundle'),
      format: 'esm', platform: 'browser', jsx: 'automatic', logLevel: 'silent',
      define: { 'process.env.NODE_ENV': '"production"' }, loader: { '.ttf': 'file', '.png': 'file' },
      stdin: { resolveDir: raiz, sourcefile: 'prueba-notificaciones.tsx', loader: 'tsx', contents: `
        import { useState } from 'react';
        import { createRoot } from 'react-dom/client';
        import Notificaciones from './src/components/notificaciones/Notificaciones';
        import EditarAsignatura from './src/features/asignaturas/EditarAsignatura';
        import './src/styles/variables.css';
        import './src/styles/global.css';
        import './src/styles/botones.css';
        function Prueba() {
          const [abierto, cambiarAbierto] = useState(false);
          return <><Notificaciones /><button id="abrir" onClick={() => cambiarAbierto(true)}>Abrir panel</button>
            {abierto && <EditarAsignatura asignatura={{ codigo: 'PRUEBA', nombre: 'Asignatura sintética', departamentoId: 1,
              semestreMalla: 2, esCritica: false, tiposHora: [] }} departamentos={[{ id: 1, nombre: 'Departamento sintético' }]}
              alCerrar={() => cambiarAbierto(false)} alCompletar={() => cambiarAbierto(false)} />}</>;
        }
        createRoot(document.getElementById('root')!).render(<Prueba />);
      ` },
      plugins: [{ name: 'api-sintetica', setup(compilador) {
        compilador.onResolve({ filter: /\/asignaturas\.api$/ }, () => ({ path: 'api', namespace: 'simulada' }));
        compilador.onLoad({ filter: /.*/, namespace: 'simulada' }, () => ({ contents:
          'export const asignaturasApi = { editar: async () => { if (!window.guardadoCorrecto) throw new Error("Fallo sintético de guardado."); } };' }));
      } }],
    });
    const archivos = new Map(resultado.outputFiles.map(archivo => [`/${basename(archivo.path)}`, archivo.contents]));
    const html = '<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Prueba de notificaciones</title><link rel="stylesheet" href="/stdin.css"><div id="root"></div><script type="module" src="/stdin.js"></script></html>';
    servidor = createServer((peticion, respuesta) => {
      const ruta = new URL(peticion.url, 'http://localhost').pathname;
      respuesta.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'none'; font-src 'self'; img-src 'self' data:");
      if (ruta === '/') { respuesta.setHeader('Content-Type', 'text/html; charset=utf-8'); respuesta.end(html); }
      else if (ruta === '/favicon.ico') { respuesta.writeHead(204); respuesta.end(); }
      else if (archivos.has(ruta)) { respuesta.setHeader('Content-Type', ruta.endsWith('.js') ? 'text/javascript' : ruta.endsWith('.css') ? 'text/css' : 'application/octet-stream'); respuesta.end(archivos.get(ruta)); }
      else { respuesta.writeHead(404); respuesta.end(); }
    });
    servidor.listen(0, '127.0.0.1');
    await once(servidor, 'listening');
    const origen = `http://127.0.0.1:${servidor.address().port}`;
    proceso = spawn(ejecutable, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
      '--disable-background-networking', '--disable-extensions', '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1, EXCLUDE localhost',
      '--remote-debugging-port=0', `--user-data-dir=${carpeta}`, 'about:blank'], { stdio: 'ignore', windowsHide: true });
    let falloInicio;
    proceso.on('error', fallo => { falloInicio = fallo; });
    let puerto;
    for (let intento = 0; intento < 100; intento++) {
      if (falloInicio) throw falloInicio;
      try { puerto = (await readFile(join(carpeta, 'DevToolsActivePort'), 'utf8')).split('\n')[0]; break; } catch { await pausa(100); }
    }
    assert.ok(puerto, 'El navegador no abrió su puerto de depuración');
    const paginas = await (await fetch(`http://127.0.0.1:${puerto}/json/list`)).json();
    socket = new WebSocket(paginas.find(pagina => pagina.type === 'page').webSocketDebuggerUrl);
    await once(socket, 'open');
    socket.addEventListener('message', evento => {
      const mensaje = JSON.parse(evento.data);
      if (mensaje.id) {
        const pendiente = pendientes.get(mensaje.id);
        if (pendiente) { clearTimeout(pendiente.temporizador); pendientes.delete(mensaje.id); mensaje.error ? pendiente.reject(new Error(JSON.stringify(mensaje.error))) : pendiente.resolve(mensaje.result); }
      } else if (mensaje.method === 'Runtime.exceptionThrown') errores.push(mensaje.params.exceptionDetails.text);
      else if (mensaje.method === 'Runtime.consoleAPICalled' && mensaje.params.type === 'error') errores.push(mensaje.params.args.map(argumento => argumento.value || argumento.description).join(' '));
      else if (mensaje.method === 'Fetch.requestPaused') {
        const { requestId, request } = mensaje.params;
        const permitida = request.url.startsWith(`${origen}/`);
        if (!permitida) solicitudesExternas.push(request.url);
        comando(permitida ? 'Fetch.continueRequest' : 'Fetch.failRequest', permitida ? { requestId } : { requestId, errorReason: 'BlockedByClient' }).catch(fallo => errores.push(fallo.message));
      }
    });
    await comando('Runtime.enable');
    await comando('Fetch.enable', { patterns: [{ urlPattern: '*' }] });
    await comando('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    await comando('Page.navigate', { url: origen });
    await esperar('document.querySelector("#abrir")');
    await evaluar('document.querySelector("#abrir").click()');
    await esperar('document.querySelector("dialog:modal")');
    const guardar = '[...document.querySelectorAll("dialog button")].find(boton => boton.textContent.includes("Guardar asignatura")).click()';
    await evaluar(guardar);
    await esperar(`${aviso}?.textContent.includes("Fallo sintético de guardado.")`);
    assert.equal(await evaluar(`document.querySelectorAll('[data-sonner-toaster]').length`), 1);
    assert.equal(await evaluar(`document.querySelector('dialog:modal').contains(${aviso})`), true);
    // Espera la animación, luego comprueba dibujo real, no solo presencia en DOM.
    await esperar(`(() => { const nodo = ${aviso}; const caja = nodo.getBoundingClientRect(); const punto = document.elementFromPoint(caja.x + caja.width / 2, caja.y + caja.height / 2); return caja.width > 0 && caja.x >= 0 && caja.right <= innerWidth && caja.y >= 0 && caja.bottom <= innerHeight && nodo.contains(punto); })()`);
    const accesibilidad = await comando('Accessibility.getFullAXTree');
    assert.ok(accesibilidad.nodes.some(nodo => !nodo.ignored && nodo.name?.value === 'Fallo sintético de guardado.'));
    assert.ok(accesibilidad.nodes.some(nodo => !nodo.ignored && nodo.name?.value === 'Cerrar notificación' && nodo.properties?.some(propiedad => propiedad.name === 'focusable' && propiedad.value.value)));
    await evaluar('window.toasterOriginal = document.querySelector("[data-sonner-toaster]"); document.querySelector("dialog button").focus()');
    for (let intento = 0; intento < 20 && !(await evaluar(`document.activeElement === ${cierre}`)); intento++) await tecla('Tab', 'Tab', 9);
    assert.equal(await evaluar(`document.activeElement === ${cierre}`), true, 'Tab alcanza el cierre del aviso dentro del modal');
    await tecla(' ', 'Space', 32);
    await esperar(`!${aviso}`);
    // La validación local debe seguir en el formulario, sin otra notificación.
    await evaluar(`(() => { const campo = document.querySelector('dialog input[required]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(campo, '   '); campo.dispatchEvent(new Event('input', { bubbles: true })); })()`);
    await pausa(50);
    await evaluar(guardar);
    await esperar('document.querySelector("dialog [role=alert]")?.textContent.includes("Ingresa el nombre")');
    assert.equal(await evaluar(`Boolean(${aviso})`), false);
    await evaluar(`(() => { const campo = document.querySelector('dialog input[required]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(campo, 'Nombre corregido'); campo.dispatchEvent(new Event('input', { bubbles: true })); window.guardadoCorrecto = true; })()`);
    await pausa(50);
    await evaluar(guardar);
    await esperar(`!document.querySelector('dialog') && ${aviso}?.textContent.includes('Cambios guardados.')`);
    await evaluar('window.toasterConfirmacion = document.querySelector("[data-sonner-toaster]"); document.querySelector("#abrir").click()');
    await esperar(`document.querySelector('dialog:modal')?.contains(${aviso})`);
    assert.equal(await evaluar('window.toasterConfirmacion === document.querySelector("[data-sonner-toaster]")'), true);
    await evaluar('[...document.querySelectorAll("dialog button")].find(boton => boton.textContent === "Cerrar").click()');
    await esperar(`!document.querySelector('dialog') && ${aviso}`);
    assert.equal(await evaluar('window.toasterConfirmacion === document.querySelector("[data-sonner-toaster]")'), true);
    assert.deepEqual(solicitudesExternas, []);
    assert.deepEqual(errores, []);
  } finally {
    if (socket?.readyState === WebSocket.OPEN) { try { await comando('Browser.close'); } catch { /* El navegador puede cerrar antes de responder. */ } }
    socket?.close();
    for (const pendiente of pendientes.values()) clearTimeout(pendiente.temporizador);
    if (proceso && proceso.exitCode === null) {
      await Promise.race([once(proceso, 'exit'), pausa(3000)]);
      if (proceso.exitCode === null) { proceso.kill(); await once(proceso, 'exit'); }
    }
    if (servidor) { servidor.closeAllConnections(); await new Promise(resolve => servidor.close(resolve)); }
    await rm(carpeta, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
});
