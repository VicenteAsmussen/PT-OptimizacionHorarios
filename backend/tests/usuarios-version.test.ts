import { beforeEach, describe, expect, it, vi } from "vitest";

const doble = vi.hoisted(() => ({
  consultas: [] as { sql: string; parametros: unknown[] }[],
  respuestas: [] as unknown[][][],
  transaccion: vi.fn(),
  fallarActualizacion: false,
}));
vi.mock("../src/config/db.js", async () => {
  const { drizzle } = await import("drizzle-orm/pg-proxy");
  const esquema = await import("../src/db/schema/index.js");
  const proxy = drizzle(async (sql, parametros) => {
    doble.consultas.push({ sql, parametros });
    if (doble.fallarActualizacion && sql.startsWith('update "usuarios"')) throw new Error("Actualización fallida");
    return { rows: doble.respuestas.shift() ?? [] };
  }, { schema: esquema });
  doble.transaccion.mockImplementation(async (operacion) => operacion(proxy));
  return { db: new Proxy(proxy, { get: (objeto, propiedad) => propiedad === "transaction" ? doble.transaccion : Reflect.get(objeto, propiedad) }) };
});
import { usuariosRepository } from "../src/repositories/usuarios.repository.js";
import { profesoresRepository } from "../src/repositories/profesores.repository.js";

beforeEach(() => {
  vi.clearAllMocks();
  doble.consultas.length = 0;
  doble.respuestas.length = 0;
  doble.fallarActualizacion = false;
});

describe("Revocación atómica en los repositorios de cuentas", () => {
  it.each([{ rol: "profesor" as const }, { rol: "admin" as const }, { clave: "nuevo-hash" }, { correo: "nuevo@example.test" }])(
    "actualización de usuario %j incrementa versión sin consultar sesiones", async (datos) => {
      await usuariosRepository.update(7, datos);
      expect(doble.transaccion).toHaveBeenCalledOnce();
      expect(doble.consultas[0].sql).toMatch(/^update "usuarios".*"version_sesion" = "usuarios"\."version_sesion" \+ 1/);
      expect(doble.consultas[0].parametros).toContain(7);
      expect(doble.consultas.every(consulta => !consulta.sql.includes('"sesiones"'))).toBe(true);
    },
  );
  it.each([{ clave: "nuevo-hash" }, { correo: "nuevo@example.test" }])(
    "cuenta vinculada %j reutiliza revocación transaccional", async (datos) => {
      await profesoresRepository.updateUsuarioForProfesor(7, datos);
      expect(doble.transaccion).toHaveBeenCalledOnce();
      expect(doble.consultas[0].sql).toContain('"version_sesion" = "usuarios"."version_sesion" + 1');
      expect(doble.consultas).toHaveLength(1);
    },
  );
  it("propaga fallo de actualización para abortar la transacción, no devuelve éxito", async () => {
    doble.fallarActualizacion = true;
    await expect(usuariosRepository.update(7, { clave: "nuevo-hash" })).rejects.toThrow();
    expect(doble.transaccion).toHaveBeenCalledOnce();
    expect(doble.consultas).toHaveLength(1);
  });
  it.each(["usuario", "profesor"])("editar solo nombre de %s preserva sesiones existentes", async (tipo) => {
    if (tipo === "usuario") await usuariosRepository.update(7, { nombre: "Nombre nuevo" });
    else await profesoresRepository.updateUsuarioForProfesor(7, { nombre: "Nombre nuevo", correo: undefined });
    expect(doble.consultas[0].sql).toMatch(/^update "usuarios" set "nombre" = \$1/);
    expect(doble.consultas[0].sql).not.toContain('"version_sesion" =');
    expect(doble.consultas[0].parametros).toEqual(["Nombre nuevo", 7]);
  });
  it("la escritura de secretaría vuelve a exigir rol profesor en SQL y no revoca una cuenta privilegiada", async () => {
    await expect(profesoresRepository.updateUsuarioForProfesor(7, { clave: "nuevo-hash" }, true)).rejects.toThrow("cuenta de profesor gestionable");
    expect(doble.consultas).toHaveLength(1);
    expect(doble.consultas[0].sql).toContain('"usuarios"."rol" =');
    expect(doble.consultas[0].parametros).toEqual(["nuevo-hash", 7, "profesor"]);
  });
  it("la retirada de acceso condiciona la baja al rol vigente y propaga el rechazo transaccional", async () => {
    await expect(profesoresRepository.deleteUsuarioForProfesor(1, 7, true)).rejects.toThrow("cuenta de profesor gestionable");
    expect(doble.transaccion).toHaveBeenCalledOnce();
    expect(doble.consultas[1].sql).toContain('delete from "usuarios"');
    expect(doble.consultas[1].parametros).toEqual([7, "profesor"]);
  });
});

