import { once } from "node:events";
import type { Server } from "node:http";
import express from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { errorHandler } from "../src/middlewares/error.middleware.js";
import {
  AppError,
  BadRequestError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
} from "../src/utils/errors.js";

const limiteJson = 100 * 1024;
const marcaPrivada = "credencial-ficticia-no-publicar";
const respuestaInterna = {
  status: "error",
  statusCode: 500,
  message: "Internal server error",
};

function crearCuerpo(tamano: number): string {
  const longitudBase = Buffer.byteLength(JSON.stringify({ contenido: marcaPrivada }));
  return JSON.stringify({ contenido: marcaPrivada + "x".repeat(tamano - longitudBase) });
}

describe("errores JSON mediante HTTP real, sin recursos externos", () => {
  let servidor: Server;
  let fallo: Error;
  let registrarError: ReturnType<typeof vi.spyOn>;
  const ejecutarRuta = vi.fn();

  beforeEach(async () => {
    ejecutarRuta.mockReset();
    registrarError = vi.spyOn(console, "error").mockImplementation(() => {});
    fallo = new Error("Fallo ficticio no publicable");
    const entradas: unknown[] = [];
    const aplicacion = express();
    aplicacion.use(express.json());
    aplicacion.get("/estado", (_peticion, respuesta) => {
      respuesta.json({ entradas, contador: entradas.length });
    });
    aplicacion.post("/control", (peticion, respuesta) => {
      ejecutarRuta(peticion.body);
      entradas.push(peticion.body);
      respuesta.status(201).json({ datos: peticion.body });
    });
    aplicacion.post("/fallo", (_peticion, _respuesta, siguiente) => siguiente(fallo));
    aplicacion.use(errorHandler);
    servidor = aplicacion.listen(0, "127.0.0.1");
    await once(servidor, "listening");
  });

  afterEach(async () => {
    try {
      await new Promise<void>((resolver, rechazar) => {
        servidor.close((error) => error ? rechazar(error) : resolver());
      });
    } finally {
      vi.restoreAllMocks();
    }
  });

  it.each([
    ["JSON truncado", `{"credencial":"${marcaPrivada}"`, 400, "El cuerpo contiene JSON no válido."],
    ["JSON con separador inválido", `{"credencial":"${marcaPrivada}",}`, 400, "El cuerpo contiene JSON no válido."],
    ["cuerpo un byte sobre 100kb", crearCuerpo(limiteJson + 1), 413, "El cuerpo de la solicitud es demasiado grande."],
  ] as const)("rechaza %s sin ejecutar la ruta, mutar estado ni registrar el cuerpo", async (_caso, cuerpo, codigo, mensaje) => {
    const estadoAnterior = await request(servidor).get("/estado");
    const respuesta = await request(servidor).post("/control")
      .set("Content-Type", "application/json").send(cuerpo);
    const estadoPosterior = await request(servidor).get("/estado");

    expect(respuesta.status).toBe(codigo);
    expect(respuesta.body).toEqual({ status: "error", statusCode: codigo, message: mensaje });
    expect(respuesta.headers["content-type"]).toMatch(/^application\/json\b/);
    expect(respuesta.text).not.toContain(marcaPrivada);
    expect(ejecutarRuta).not.toHaveBeenCalled();
    expect(estadoAnterior.status).toBe(200);
    expect(estadoAnterior.body).toEqual({ entradas: [], contador: 0 });
    expect(estadoPosterior.status).toBe(200);
    expect(estadoPosterior.body).toEqual(estadoAnterior.body);
    expect(registrarError).not.toHaveBeenCalled();
  });

  it.each([
    ["objeto válido", { nombre: "Prueba", opciones: { activo: true }, bloques: [1, 2] }],
    ["objeto justo en 100kb", JSON.parse(crearCuerpo(limiteJson))],
  ])("preserva %s, la respuesta y una única escritura", async (_caso, entrada) => {
    const respuesta = await request(servidor).post("/control").send(entrada);
    const estado = await request(servidor).get("/estado");

    expect(respuesta.status).toBe(201);
    expect(respuesta.body).toEqual({ datos: entrada });
    expect(ejecutarRuta).toHaveBeenCalledExactlyOnceWith(entrada);
    expect(estado.status).toBe(200);
    expect(estado.body).toEqual({ entradas: [entrada], contador: 1 });
    expect(registrarError).not.toHaveBeenCalled();
  });

  it.each([
    [new BadRequestError(), 400, "Bad request"],
    [new UnauthorizedError(), 401, "Unauthorized access"],
    [new ForbiddenError(), 403, "Forbidden access"],
    [new NotFoundError(), 404, "Resource not found"],
    [new ConflictError(), 409, "Conflict occurred"],
    [new AppError("Mensaje de dominio", 400), 400, "Mensaje de dominio"],
    [new AppError("Otro error de dominio", 422), 422, "Otro error de dominio"],
  ] as const)("conserva el error de dominio %s", async (error, codigo, mensaje) => {
    fallo = error;
    const respuesta = await request(servidor).post("/fallo").send({ dato: "válido" });

    expect(respuesta.status).toBe(codigo);
    expect(respuesta.body).toEqual({ status: "error", statusCode: codigo, message: mensaje });
    expect(registrarError).not.toHaveBeenCalled();
    expect(ejecutarRuta).not.toHaveBeenCalled();
    const estado = await request(servidor).get("/estado");
    expect(estado.status).toBe(200);
    expect(estado.body).toEqual({ entradas: [], contador: 0 });
  });

  it.each([
    ["entity.parse.failed", 400, "El cuerpo contiene JSON no válido."],
    ["entity.too.large", 413, "El cuerpo de la solicitud es demasiado grande."],
  ] as const)("reconoce %s con cualquiera de los alias numéricos", async (tipo, codigo, mensaje) => {
    for (const propiedades of [{ status: codigo }, { statusCode: codigo }]) {
      fallo = Object.assign(new Error(marcaPrivada), {
        type: tipo, body: marcaPrivada, stack: marcaPrivada, ...propiedades,
      });
      const respuesta = await request(servidor).post("/fallo").send({ dato: "válido" });

      expect(respuesta.status).toBe(codigo);
      expect(respuesta.body).toEqual({ status: "error", statusCode: codigo, message: mensaje });
      expect(respuesta.text).not.toContain(marcaPrivada);
      expect(registrarError).not.toHaveBeenCalled();
      expect(ejecutarRuta).not.toHaveBeenCalled();
      const estado = await request(servidor).get("/estado");
      expect(estado.status).toBe(200);
      expect(estado.body).toEqual({ entradas: [], contador: 0 });
    }
  });

  it.each([
    ["error desconocido", {}],
    ["status arbitrario", { status: 400 }],
    ["statusCode arbitrario", { statusCode: 413 }],
    ["tipo ajeno", { type: "request.aborted", status: 400, statusCode: 400 }],
    ["parseo con estado incorrecto", { type: "entity.parse.failed", status: 413, statusCode: 413 }],
    ["tamaño con estado incorrecto", { type: "entity.too.large", status: 400, statusCode: 400 }],
    ["parseo con alias contradictorios", { type: "entity.parse.failed", status: 400, statusCode: 500 }],
    ["tamaño con alias contradictorios", { type: "entity.too.large", status: 500, statusCode: 413 }],
    ["parseo sin estado", { type: "entity.parse.failed" }],
    ["tamaño sin estado", { type: "entity.too.large" }],
    ["estado textual", { type: "entity.parse.failed", status: "400", statusCode: "400" }],
    ["alias textual contradictorio", { type: "entity.too.large", status: 413, statusCode: "413" }],
  ])("mantiene el 500 genérico para %s", async (_caso, propiedades) => {
    fallo = Object.assign(new Error(marcaPrivada), {
      body: marcaPrivada, errors: [{ detalle: marcaPrivada }], ...propiedades,
    });
    const respuesta = await request(servidor).post("/fallo").send({ dato: "válido" });

    expect(respuesta.status).toBe(500);
    expect(respuesta.body).toEqual(respuestaInterna);
    expect(respuesta.text).not.toContain(marcaPrivada);
    expect(registrarError).toHaveBeenCalledExactlyOnceWith("Unhandled Error:", fallo);
    expect(ejecutarRuta).not.toHaveBeenCalled();
    const estado = await request(servidor).get("/estado");
    expect(estado.status).toBe(200);
    expect(estado.body).toEqual({ entradas: [], contador: 0 });
  });
});
