import { afterAll, beforeAll, expect, it } from "vitest";
import express from "express";
import request from "supertest";
import { once } from "node:events";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Server } from "node:http";
import { montarFrontend } from "../src/config/frontend.js";

let servidor: Server;
beforeAll(async () => {
  // El arnés padre retira su temporal externo completo al terminar.
  const directorio = await mkdtemp(join(process.env.VERIFICACION_TEMPORAL ?? tmpdir(), "frontend-http-"));
  await mkdir(join(directorio, "assets"));
  await writeFile(join(directorio, "index.html"), "<!doctype html><title>Aplicación compilada</title>");
  await writeFile(join(directorio, "assets", "app.js"), "console.log('compilado');");
  await writeFile(join(directorio, ".env"), "NO_PUBLICAR=valor-sintetico");
  const aplicacion = express();
  aplicacion.use("/api", (_peticion, respuesta) => respuesta.status(404).json({ status: "error" }));
  montarFrontend(aplicacion, directorio);
  servidor = aplicacion.listen(0, "127.0.0.1");
  await once(servidor, "listening");
});
afterAll(async () => { if (servidor) await new Promise<void>((resolver, rechazar) => servidor.close(error => error ? rechazar(error) : resolver())); });

it("sirve frontend compilado y rutas SPA sin redirección HTTPS ni Vite", async () => {
  for (const ruta of ["/", "/login", "/profesores"]) {
    const respuesta = await request(servidor).get(ruta).accept("html");
    expect(respuesta.status).toBe(200);
    expect(respuesta.text).toContain("Aplicación compilada");
    expect(respuesta.headers.location).toBeUndefined();
  }
  const archivo = await request(servidor).get("/assets/app.js");
  expect(archivo.status).toBe(200);
  expect(archivo.text).toBe("console.log('compilado');");
});

it("no confunde la API ni archivos ausentes u ocultos con rutas SPA", async () => {
  const api = await request(servidor).get("/api/desconocida").accept("html");
  expect(api.status).toBe(404);
  expect(api.type).toBe("application/json");
  for (const ruta of ["/assets/ausente.js", "/.env", "/carpeta/.env"]) {
    expect((await request(servidor).get(ruta)).status).toBe(404);
  }
});
