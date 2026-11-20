// Mismo aislamiento CDP del ensayo pulido-interfaz: perfil propio y red bloqueada.
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { setTimeout as pausa } from 'node:timers/promises';

// Abre un perfil descartable y limita las peticiones del navegador al origen sintético del ensayo.
export async function abrirNavegador(origen) {
  const ejecutable = process.env.NAVEGADOR_PRUEBAS || [
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    '/usr/bin/chromium', '/usr/bin/chromium-browser',
  ].find(existsSync);
  if (!ejecutable) throw new Error('Falta un navegador instalado, no se descargará ninguno.');
  const base = process.env.OPENCODE_TMPDIR || (existsSync(join(tmpdir(), 'opencode')) ? join(tmpdir(), 'opencode') : tmpdir());
  const temporal = await mkdtemp(join(base, 'regresion-salas-'));
  const proceso = spawn(ejecutable, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--disable-background-networking', '--disable-extensions', '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1',
    '--remote-debugging-port=0', `--user-data-dir=${temporal}`, 'about:blank'], { stdio: 'ignore', windowsHide: true });
  const pendientes = new Map(), errores = [], externas = [];
  let socket, secuencia = 0, falloInicio;
  proceso.on('error', error => { falloInicio = error; });
  const comando = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++secuencia;
    const temporizador = setTimeout(() => { pendientes.delete(id); reject(new Error(`Tiempo agotado: ${method}`)); }, 8000);
    pendientes.set(id, { resolve, reject, temporizador });
    socket.send(JSON.stringify({ id, method, params }));
  });
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
    assert.fail(`No se cumplió: ${expresion}\n${await evaluar('document.body.innerText')}\n${JSON.stringify(errores)}`);
  }
  // Espera el cierre del proceso antes de retirar su perfil y resuelve las órdenes CDP pendientes.
  async function cerrar() {
    if (socket?.readyState === WebSocket.OPEN) { try { await comando('Browser.close'); } catch { /* El navegador puede cerrar antes de responder. */ } }
    socket?.close();
    for (const pendiente of pendientes.values()) { clearTimeout(pendiente.temporizador); pendiente.resolve({}); }
    if (proceso.pid && proceso.exitCode === null) {
      await Promise.race([once(proceso, 'exit'), pausa(3000)]);
      if (proceso.exitCode === null) { proceso.kill(); await once(proceso, 'exit'); }
    }
    await rm(temporal, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
  try {
    let puerto;
    for (let intento = 0; intento < 100; intento++) {
      if (falloInicio) throw falloInicio;
      try { puerto = (await readFile(join(temporal, 'DevToolsActivePort'), 'utf8')).split('\n')[0]; break; } catch { await pausa(100); }
    }
    assert.ok(puerto, 'El navegador debe abrir su puerto de depuración');
    const paginas = await (await fetch(`http://127.0.0.1:${puerto}/json/list`)).json();
    socket = new WebSocket(paginas.find(pagina => pagina.type === 'page').webSocketDebuggerUrl); await once(socket, 'open');
    socket.addEventListener('message', evento => {
      const mensaje = JSON.parse(evento.data), pendiente = pendientes.get(mensaje.id);
      if (pendiente) {
        clearTimeout(pendiente.temporizador); pendientes.delete(mensaje.id);
        mensaje.error ? pendiente.reject(new Error(JSON.stringify(mensaje.error))) : pendiente.resolve(mensaje.result);
      } else if (mensaje.method === 'Runtime.exceptionThrown') errores.push(mensaje.params.exceptionDetails.text);
      else if (mensaje.method === 'Runtime.consoleAPICalled' && mensaje.params.type === 'error') errores.push(mensaje.params.args.map(argumento => argumento.value || argumento.description).join(' '));
      else if (mensaje.method === 'Fetch.requestPaused') {
        const { requestId, request } = mensaje.params, permitida = request.url.startsWith(`${origen}/`);
        if (!permitida) externas.push(request.url);
        comando(permitida ? 'Fetch.continueRequest' : 'Fetch.failRequest', permitida ? { requestId } : { requestId, errorReason: 'BlockedByClient' }).catch(error => errores.push(error.message));
      }
    });
    await comando('Runtime.enable'); await comando('Page.enable'); await comando('Fetch.enable', { patterns: [{ urlPattern: '*' }] });
    return { comando, evaluar, esperar, cerrar, temporal, errores, externas };
  } catch (error) { await cerrar(); throw error; }
}
