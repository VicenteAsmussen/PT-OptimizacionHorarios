import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { build as compilar, createServer as crearServidor, loadConfigFromFile as cargarConfiguracion } from "vite";

export { transformWithEsbuild } from "vite";

// Exclusivo del arnés. No cambia la configuración de la aplicación en desarrollo.
export function configuracionAislada(opciones, cache) {
  const { envFile: _entornoAnterior, ...resto } = opciones;
  return { ...resto, envDir: false, cacheDir: cache, configLoader: "runner",
    optimizeDeps: { ...opciones.optimizeDeps, noDiscovery: true, include: [] },
    server: { ...opciones.server, host: "127.0.0.1", ws: false, hmr: false, watch: null } };
}

export function loadConfigFromFile(entorno, archivo, raiz, nivel, registrador) {
  return cargarConfiguracion(entorno, archivo, raiz, nivel, registrador, "runner");
}

export async function createServer(opciones = {}) {
  const cache = await mkdtemp(join(tmpdir(), "vite-pruebas-"));
  try {
    const servidor = await crearServidor(configuracionAislada(opciones, cache));
    const cerrar = servidor.close.bind(servidor);
    servidor.close = async () => {
      try { await cerrar(); }
      finally { await rm(cache, { recursive: true, force: true }); }
    };
    return servidor;
  } catch (error) {
    await rm(cache, { recursive: true, force: true });
    throw error;
  }
}

export async function build(opciones = {}) {
  const cache = await mkdtemp(join(tmpdir(), "vite-pruebas-"));
  try {
    return await compilar({ ...configuracionAislada(opciones, cache), build: { ...opciones.build, write: false } });
  } finally { await rm(cache, { recursive: true, force: true }); }
}
