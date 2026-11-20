import express, { type Application } from "express";
import { existsSync } from "node:fs";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";

const directorioFrontend = fileURLToPath(new URL("../../../frontend/dist/", import.meta.url));

// Solo publica el resultado compilado, nunca el directorio raíz ni archivos de entorno.
export function montarFrontend(aplicacion: Application, directorio = directorioFrontend): void {
  aplicacion.use(express.static(directorio));
  aplicacion.get(/.*/, (peticion, respuesta, siguiente) => {
    if (extname(peticion.path) || peticion.path.split("/").some(segmento => segmento.startsWith("."))
      || !peticion.accepts("html")) {
      siguiente();
      return;
    }
    respuesta.sendFile(join(directorio, "index.html"));
  });
}

export function exigirFrontendCompilado(): void {
  if (!existsSync(join(directorioFrontend, "index.html"))) {
    throw new Error("Falta frontend/dist/index.html. Compile el frontend antes del arranque productivo.");
  }
}
