import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { setTimeout as pausa } from 'node:timers/promises';

const raiz = fileURLToPath(new URL('../../', import.meta.url));
const requerir = createRequire(new URL('../../package.json', import.meta.url));
const { build } = createRequire(requerir.resolve('vite/package.json'))('esbuild');

function contraste(texto, fondo) {
  const luminancia = color => color.match(/\d+/g).slice(0, 3).map(Number)
    .map(valor => valor / 255).map(valor => valor <= 0.04045 ? valor / 12.92 : ((valor + 0.055) / 1.055) ** 2.4)
    .reduce((suma, valor, indice) => suma + valor * [0.2126, 0.7152, 0.0722][indice], 0);
  const valores = [luminancia(texto), luminancia(fondo)].sort((a, b) => b - a);
  return (valores[0] + 0.05) / (valores[1] + 0.05);
}

// Componentes reales y rutas reales, con identidad y respuestas solo sintéticas.
test('pulido de interfaz en navegador aislado', { timeout: 90000 }, async contexto => {
  const ejecutable = process.env.NAVEGADOR_PRUEBAS || [
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome',
  ].find(existsSync);
  if (!ejecutable) { contexto.skip('Se requiere Edge o Chromium. Configura NAVEGADOR_PRUEBAS.'); return; }
  const carpeta = await mkdtemp(join(process.env.OPENCODE_TMPDIR || tmpdir(), 'pulido-interfaz-'));
  let servidor, proceso, socket, secuencia = 0;
  const pendientes = new Map(), errores = [], solicitudesExternas = [];
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
    assert.fail(`No se cumplió: ${expresion}\n${await evaluar('document.body?.innerText')}\n${JSON.stringify(errores)}`);
  }
  async function tecla(key, code, numero) {
    for (const type of ['keyDown', 'keyUp']) await comando('Input.dispatchKeyEvent', {
      type, key, code, windowsVirtualKeyCode: numero,
      ...(type === 'keyDown' && key === 'Enter' ? { text: '\r', unmodifiedText: '\r' } : {}),
    });
  }
  async function escribir(texto) {
    await evaluar('document.querySelector("[role=combobox]").focus()');
    await comando('Input.insertText', { text: texto });
  }
  async function captura(nombre) {
    if (!process.env.CAPTURAS_INTERFAZ) return;
    const { data } = await comando('Page.captureScreenshot', { format: 'png' });
    await writeFile(join(process.env.CAPTURAS_INTERFAZ, `${nombre}.png`), Buffer.from(data, 'base64'));
  }
  try {
    const resultado = await build({
      absWorkingDir: raiz, bundle: true, write: false, outdir: join(carpeta, 'bundle'), publicPath: '/',
      format: 'esm', platform: 'browser', jsx: 'automatic', logLevel: 'silent',
      define: { 'process.env.NODE_ENV': '"production"' }, loader: { '.ttf': 'file', '.png': 'file', '.svg': 'file' },
      stdin: { resolveDir: raiz, sourcefile: 'prueba-pulido.tsx', loader: 'tsx', contents: `
        import { useState } from 'react';
        import { createRoot } from 'react-dom/client';
        import { RouterProvider } from 'react-router-dom';
        import { router } from './src/app/router';
        import PanelAsignatura from './src/features/asignaturas/PanelAsignatura';
        import SelectorProfesor from './src/features/asignaturas/SelectorProfesor';
        import './src/styles/variables.css'; import './src/styles/global.css'; import './src/styles/botones.css';
        window.PanelPrueba = function PanelPrueba() {
          const [abierto, cambiarAbierto] = useState(false), [profesorId, seleccionar] = useState(null);
          return <><h1>Panel principal sintético</h1><button id="abrir" onClick={() => cambiarAbierto(true)}>Abrir formulario</button>
            {abierto && <PanelAsignatura titulo="Asignación sintética" ocupado={false} alCerrar={() => cambiarAbierto(false)}>
              <form onSubmit={evento => evento.preventDefault()}><SelectorProfesor profesorId={profesorId} alSeleccionar={seleccionar}
                contexto="Teoría" profesores={[{ id: 1, nombre: 'Ana Pérez', rut: '1-9', departamento: { nombre: 'Departamento sintético' } },
                  { id: 2, nombre: 'Ana Soto', rut: '2-7', departamento: { nombre: 'Departamento sintético' } }]} /></form>
            </PanelAsignatura>}</>;
        };
        createRoot(document.getElementById('root')!).render(<RouterProvider router={router} />);
      ` },
      plugins: [{ name: 'entorno-sintetico', setup(compilador) {
        compilador.onResolve({ filter: /\/useAuth$/ }, () => ({ path: 'identidad', namespace: 'sintetico' }));
        compilador.onResolve({ filter: /\/mi-horario\.api$/ }, () => ({ path: 'horario', namespace: 'sintetico' }));
        compilador.onResolve({ filter: /\/SeguimientoOptimizacion$/ }, () => ({ path: 'seguimiento', namespace: 'sintetico' }));
        compilador.onResolve({ filter: /Page$/ }, argumento => argumento.importer.endsWith('router.tsx') && !argumento.path.endsWith('/MiHorarioPage')
          ? { path: 'paginas', namespace: 'sintetico' } : undefined);
        compilador.onLoad({ filter: /.*/, namespace: 'sintetico' }, argumento => ({ loader: 'jsx', resolveDir: raiz, contents: {
          identidad: 'export const useAuth = () => ({ usuario: { id: 1, nombre: "Persona sintética", rol: window.rolPrueba || "profesor" }, cargando: false, logout: async () => {} });',
          horario: 'export const miHorarioApi = { contexto: () => new Promise(resolver => window.resolverContexto = resolver), consultar: () => new Promise(resolver => window.resolverHorario = resolver) };',
          seguimiento: 'export const SeguimientoOptimizacion = ({ children }) => children;',
          paginas: `import { Outlet } from 'react-router-dom'; export default function Pagina() { return <window.PanelPrueba />; }
            export const RequireGestionProfesores = Outlet, RequireGestionAsignaturas = Outlet, RequireDisponibilidad = Outlet,
              RequireSeguimientoDisponibilidad = Outlet, RequireAdministracionPeriodos = Outlet, RequireResultadosHorarios = Outlet, RequireOptimizacion = Outlet;`,
        }[argumento.path] }));
      } }],
    });
    const archivos = new Map(resultado.outputFiles.map(archivo => [`/${basename(archivo.path)}`, archivo.contents]));
    servidor = createServer((peticion, respuesta) => {
      const ruta = new URL(peticion.url, 'http://localhost').pathname;
      respuesta.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'none'; font-src 'self'; img-src 'self' data:");
      if (archivos.has(ruta)) {
        respuesta.setHeader('Content-Type', ruta.endsWith('.js') ? 'text/javascript' : ruta.endsWith('.css') ? 'text/css' : ruta.endsWith('.svg') ? 'image/svg+xml' : 'application/octet-stream');
        respuesta.end(archivos.get(ruta));
      } else if (ruta === '/favicon.ico') { respuesta.writeHead(204); respuesta.end(); }
      else { respuesta.setHeader('Content-Type', 'text/html; charset=utf-8'); respuesta.end('<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Prueba de interfaz</title><link rel="stylesheet" href="/stdin.css"><div id="root"></div><script type="module" src="/stdin.js"></script></html>'); }
    });
    servidor.listen(0, '127.0.0.1'); await once(servidor, 'listening');
    const origen = `http://127.0.0.1:${servidor.address().port}`;
    proceso = spawn(ejecutable, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
      '--disable-background-networking', '--disable-extensions', '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1, EXCLUDE localhost',
      '--remote-debugging-port=0', `--user-data-dir=${carpeta}`, 'about:blank'], { stdio: 'ignore', windowsHide: true });
    let falloInicio, puerto;
    proceso.on('error', fallo => { falloInicio = fallo; });
    for (let intento = 0; intento < 100; intento++) {
      if (falloInicio) throw falloInicio;
      try { puerto = (await readFile(join(carpeta, 'DevToolsActivePort'), 'utf8')).split('\n')[0]; break; } catch { await pausa(100); }
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
        if (!permitida) solicitudesExternas.push(request.url);
        comando(permitida ? 'Fetch.continueRequest' : 'Fetch.failRequest', permitida ? { requestId } : { requestId, errorReason: 'BlockedByClient' }).catch(fallo => errores.push(fallo.message));
      }
    });
    await comando('Runtime.enable'); await comando('Page.enable'); await comando('Fetch.enable', { patterns: [{ urlPattern: '*' }] });
    for (const movil of [false, true]) {
      await comando('Emulation.setDeviceMetricsOverride', { width: movil ? 390 : 1280, height: 900, deviceScaleFactor: 1, mobile: movil });
      await comando('Page.navigate', { url: `${origen}/app/dashboard` }); await esperar('document.querySelector("#abrir")');
      await contexto.test(`Escape cierra primero las sugerencias y después el diálogo en ${movil ? 'móvil' : 'escritorio'}`, async () => {
        await evaluar('document.querySelector("#abrir").focus(); document.querySelector("#abrir").click()'); await esperar('document.querySelector("dialog:modal")');
        await escribir('Ana'); await esperar('document.querySelector("[role=listbox]")');
        await tecla('Escape', 'Escape', 27);
        assert.equal(await evaluar('Boolean(document.querySelector("dialog:modal"))'), true, 'El primer Escape no debe cerrar el formulario');
        assert.equal(await evaluar('document.querySelector("[role=combobox]").getAttribute("aria-expanded")'), 'false');
        await tecla('Escape', 'Escape', 27); await esperar('!document.querySelector("dialog:modal")');
        assert.equal(await evaluar('document.activeElement.id'), 'abrir');
      });
      await contexto.test(`ARIA conserva destinos válidos y la asignación por teclado en ${movil ? 'móvil' : 'escritorio'}`, async () => {
        await comando('Page.navigate', { url: `${origen}/app/dashboard` }); await esperar('document.querySelector("#abrir")');
        await evaluar('document.querySelector("#abrir").focus(); document.querySelector("#abrir").click()'); await esperar('document.querySelector("dialog:modal")');
        for (const texto of ['desconocido', 'Ana']) {
          await evaluar('document.querySelector("[role=combobox]").select()'); await escribir(texto);
          await esperar(`document.querySelector('[role=combobox]').value === ${JSON.stringify(texto)}`);
          const relacion = await evaluar(`(() => { const campo = document.querySelector('[role=combobox]'), lista = document.getElementById(campo.getAttribute('aria-controls'));
            return { expandido: campo.getAttribute('aria-expanded'), destino: lista?.getAttribute('role') || null,
              activo: campo.getAttribute('aria-activedescendant'), opciones: lista?.querySelectorAll('[role=option]').length || 0 }; })()`);
          assert.equal(relacion.expandido, texto === 'Ana' ? 'true' : 'false');
          assert.equal(relacion.destino, texto === 'Ana' ? 'listbox' : null);
          if (texto !== 'Ana') {
            assert.equal(relacion.activo, null); await tecla('Enter', 'Enter', 13);
            assert.equal(await evaluar('document.querySelector("[role=combobox]").value'), texto);
            assert.ok((await evaluar('document.querySelector("dialog:modal").innerText')).includes('No hay profesores que coincidan.'));
          } else {
            assert.equal(relacion.opciones, 2);
            assert.equal(await evaluar(`document.getElementById(document.querySelector('[role=combobox]').getAttribute('aria-activedescendant'))?.getAttribute('role')`), 'option');
            await captura(movil ? 'selector-movil' : 'selector-escritorio');
          }
        }
        await tecla('ArrowDown', 'ArrowDown', 40); await tecla('Enter', 'Enter', 13);
        assert.equal(await evaluar('document.querySelector("[role=combobox]").value'), 'Ana Soto');
        assert.equal(await evaluar('document.querySelector("[role=combobox]").getAttribute("aria-expanded")'), 'false');
        await evaluar('document.querySelector("dialog:modal button").click()'); await esperar('!document.querySelector("dialog:modal")');
      });
    }
    for (const movil of [false, true]) await contexto.test(`botón de usuario: colores originales, foco, icono y teclado en ${movil ? 'móvil' : 'escritorio'}`, async () => {
      await comando('Emulation.setDeviceMetricsOverride', { width: movil ? 390 : 1280, height: 900, deviceScaleFactor: 1, mobile: movil });
      await comando('Page.navigate', { url: `${origen}/app/dashboard` }); await esperar('document.querySelector(".boton-usuario")');
      await comando('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 0, y: 890 });
      const estilos = () => evaluar(`(() => { const boton = document.querySelector('.boton-usuario'), css = getComputedStyle(boton), icono = boton.querySelector('img'), caja = boton.getBoundingClientRect();
        return { texto: css.color, fondo: css.backgroundColor, foco: css.outlineColor, anchoFoco: css.outlineWidth,
          filtro: getComputedStyle(icono).filter, iconoCargado: icono.complete && icono.naturalWidth > 0,
          textoVisible: getComputedStyle(boton.querySelector('.topbar-texto-usuario')).display !== 'none',
          ancho: caja.width, alto: caja.height, x: caja.x + caja.width / 2, y: caja.y + caja.height / 2 }; })()`);
      const reposo = await estilos();
      assert.equal(reposo.texto, 'rgb(255, 255, 255)');
      assert.equal(reposo.fondo, 'rgb(88, 166, 207)');
      await comando('Input.dispatchMouseEvent', { type: 'mouseMoved', x: reposo.x, y: reposo.y });
      const hover = await estilos(); assert.equal(hover.fondo, 'rgb(69, 150, 192)');
      await comando('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 0, y: 890 });
      await evaluar('document.querySelector(".salto-contenido").focus()');
      for (let intento = 0; intento < 8 && !(await evaluar('document.activeElement.matches(".boton-usuario")')); intento++) await tecla('Tab', 'Tab', 9);
      assert.equal(await evaluar('document.activeElement.matches(".boton-usuario:focus-visible")'), true);
      const foco = await estilos(); assert.equal(foco.anchoFoco, '3px'); assert.equal(foco.foco, 'rgb(255, 255, 255)');
      assert.equal(foco.filtro, 'brightness(0) invert(1)');
      assert.equal(foco.iconoCargado, true); assert.equal(foco.textoVisible, !movil); assert.ok(foco.ancho >= 44 && foco.alto >= 44);
      await captura(movil ? 'usuario-movil' : 'usuario-escritorio');
      await tecla('Enter', 'Enter', 13); await esperar('document.querySelector(".boton-usuario").getAttribute("aria-expanded") === "true"');
      await tecla('Tab', 'Tab', 9); assert.equal(await evaluar('document.activeElement.matches(".usuario-salir")'), true);
      await tecla('Escape', 'Escape', 27); assert.equal(await evaluar('document.activeElement.matches(".boton-usuario")'), true);
      contexto.diagnostic(`${movil ? 'Móvil' : 'Escritorio'}: reposo ${contraste(reposo.texto, reposo.fondo).toFixed(2)}:1, hover ${contraste(hover.texto, hover.fondo).toFixed(2)}:1, foco/icono ${contraste(foco.foco, foco.fondo).toFixed(2)}:1`);
      contexto.diagnostic('Contraste pendiente: se conservan los colores originales solicitados, esta prueba no acredita contraste suficiente.');
    });
    await contexto.test('404 interno conserva un único main y ofrece Panel principal a todos los roles', async () => {
      for (const rol of ['admin', 'secretaria', 'profesor']) {
        const { identifier } = await comando('Page.addScriptToEvaluateOnNewDocument', { source: `window.rolPrueba = ${JSON.stringify(rol)}` });
        try {
          await comando('Page.navigate', { url: `${origen}/app/ruta-inexistente` }); await esperar('document.querySelector(".boton-usuario")');
          assert.equal(await evaluar('window.rolPrueba'), rol);
          assert.equal(await evaluar('document.querySelectorAll("main").length'), 1);
          assert.equal(await evaluar('document.querySelector("main h1")?.textContent'), 'Página no encontrada');
          assert.equal(await evaluar('document.querySelector("main a")?.getAttribute("href")'), '/app/dashboard');
          await evaluar('document.querySelector("main a").focus()'); await tecla('Enter', 'Enter', 13); await esperar('document.querySelector("#abrir")');
        } finally { await comando('Page.removeScriptToEvaluateOnNewDocument', { identifier }); }
      }
    });
    await contexto.test('Mi horario mantiene sus dos cargas como estados con puntos suspensivos tipográficos', async () => {
      await comando('Page.navigate', { url: `${origen}/app/mi-horario` }); await esperar('window.resolverContexto');
      const planificaciones = await evaluar('document.querySelector("main [role=status]")?.textContent');
      await evaluar('window.resolverContexto({ planificaciones: [{ id: 10, codigo: "2026-2", carreraNombre: "Carrera sintética", estadoPlanificacion: "propuesta", actual: true }], bloques: [] })');
      await esperar('window.resolverHorario');
      const horario = await evaluar('document.querySelector("main [role=status]")?.textContent');
      assert.deepEqual([planificaciones, horario], ['Cargando planificaciones…', 'Cargando horario…']);
      assert.equal(await evaluar('document.querySelectorAll("[data-sonner-toast]").length'), 0);
      await evaluar('window.resolverHorario([])'); await esperar('document.querySelector("main").textContent.includes("No tienes clases con horario asignado")');
    });
    assert.deepEqual(solicitudesExternas, []); assert.deepEqual(errores, []);
  } finally {
    if (socket?.readyState === WebSocket.OPEN) { try { await comando('Browser.close'); } catch { /* Puede cerrar antes de responder. */ } }
    socket?.close(); for (const pendiente of pendientes.values()) clearTimeout(pendiente.temporizador);
    if (proceso && proceso.exitCode === null) {
      await Promise.race([once(proceso, 'exit'), pausa(3000)]);
      if (proceso.exitCode === null) { proceso.kill(); await once(proceso, 'exit'); }
    }
    if (servidor) { servidor.closeAllConnections(); await new Promise(resolve => servidor.close(resolve)); }
    await rm(carpeta, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
});
