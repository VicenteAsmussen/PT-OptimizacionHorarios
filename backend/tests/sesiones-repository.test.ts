import { beforeEach, describe, expect, it, vi } from "vitest";

const doble = vi.hoisted(() => ({
  consultas: [] as { sql: string; parametros: unknown[] }[],
  respuestas: [] as unknown[][][],
  transaccion: vi.fn(),
  fallarRevocacion: false,
}));
vi.mock("../src/config/db.js", async () => {
  const { drizzle } = await import("drizzle-orm/pg-proxy");
  const esquema = await import("../src/db/schema/index.js");
  const proxy = drizzle(async (sql, parametros) => {
    doble.consultas.push({ sql, parametros });
    if (doble.fallarRevocacion && sql.startsWith('delete from "sesiones"')) throw new Error("Revocación fallida");
    return { rows: doble.respuestas.shift() ?? [] };
  }, { schema: esquema });
  doble.transaccion.mockImplementation(async (operacion) => operacion(proxy));
  return { db: new Proxy(proxy, { get: (objeto, propiedad) => propiedad === "transaction" ? doble.transaccion : Reflect.get(objeto, propiedad) }) };
});
import { usuariosRepository } from "../src/repositories/usuarios.repository.js";
import { profesoresRepository } from "../src/repositories/profesores.repository.js";
import { sesionesRepository } from "../src/repositories/sesiones.repository.js";
import { sesiones } from "../src/db/schema/sesiones.schema.js";
import { getTableConfig } from "drizzle-orm/pg-core";

beforeEach(() => {
  vi.clearAllMocks();
  doble.consultas.length = 0;
  doble.respuestas.length = 0;
  doble.fallarRevocacion = false;
});

describe("Revocación atómica en los repositorios de cuentas", () => {
  it.each([{ rol: "profesor" as const }, { rol: "admin" as const }, { clave: "nuevo-hash" }, { correo: "nuevo@example.test" }])(
    "actualización de usuario %j incrementa versión e invalida sesiones dentro de la misma transacción", async (datos) => {
      await usuariosRepository.update(7, datos);
      expect(doble.transaccion).toHaveBeenCalledOnce();
      expect(doble.consultas[0].sql).toMatch(/^update "usuarios".*"version_sesion" = "usuarios"\."version_sesion" \+ 1/);
      expect(doble.consultas[0].parametros).toContain(7);
      expect(doble.consultas[1]).toEqual({ sql: 'delete from "sesiones" where "sesiones"."usuario_id" = $1', parametros: [7] });
    },
  );
  it.each([{ clave: "nuevo-hash" }, { correo: "nuevo@example.test" }])(
    "cuenta vinculada %j reutiliza revocación transaccional", async (datos) => {
      await profesoresRepository.updateUsuarioForProfesor(7, datos);
      expect(doble.transaccion).toHaveBeenCalledOnce();
      expect(doble.consultas[0].sql).toContain('"version_sesion" = "usuarios"."version_sesion" + 1');
      expect(doble.consultas[1]).toEqual({ sql: 'delete from "sesiones" where "sesiones"."usuario_id" = $1', parametros: [7] });
    },
  );
  it("propaga fallo de revocación para abortar la transacción, no devuelve éxito", async () => {
    doble.fallarRevocacion = true;
    await expect(usuariosRepository.update(7, { clave: "nuevo-hash" })).rejects.toThrow();
    expect(doble.transaccion).toHaveBeenCalledOnce();
    expect(doble.consultas).toHaveLength(2);
  });
  it.each(["usuario", "profesor"])("editar solo nombre de %s preserva sesiones existentes", async (tipo) => {
    if (tipo === "usuario") await usuariosRepository.update(7, { nombre: "Nombre nuevo" });
    else await profesoresRepository.updateUsuarioForProfesor(7, { nombre: "Nombre nuevo", correo: undefined });
    expect(doble.consultas[0].sql).toMatch(/^update "usuarios" set "nombre" = \$1/);
    expect(doble.consultas.some(consulta => consulta.sql.includes('delete from "sesiones"'))).toBe(false);
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

describe("Persistencia de sesiones con driver simulado", () => {
  const credenciales = { id: 7, correo: "cuenta@example.test", clave: "hash", rol: "admin" as const, versionSesion: 2 };
  const sesion = { id: "a".repeat(64), usuarioId: 7, expiraEn: new Date("2099-01-01T00:00:00Z") };
  it("bloquea la cuenta antes de insertar y conserva expiración e identidad", async () => {
    doble.respuestas.push([[7, credenciales.correo, "hash", "admin", 2]]);
    expect(await sesionesRepository.createConCredenciales(credenciales, sesion)).toBe(true);
    expect(doble.transaccion).toHaveBeenCalledOnce();
    expect(doble.consultas[0].sql).toMatch(/from "usuarios" where "usuarios"\."id" = \$1 for update$/);
    expect(doble.consultas[0].parametros).toEqual([7]);
    expect(doble.consultas[1].sql).toMatch(/^insert into "sesiones"/);
    expect(doble.consultas[1].parametros).toEqual([sesion.id, 7, sesion.expiraEn.toISOString()]);
  });
  it.each([
    [], [[7, credenciales.correo, "hash", "admin", 4]],
    [[7, credenciales.correo, "otro-hash", "admin", 2]],
    [[7, "otro@example.test", "hash", "admin", 2]],
    [[7, credenciales.correo, "hash", "profesor", 2]],
  ])("no persiste autoridad obsoleta después de baja/cambio o ida y vuelta de rol: %j", async (...filas) => {
    doble.respuestas.push(filas as unknown[][]);
    expect(await sesionesRepository.createConCredenciales(credenciales, sesion)).toBe(false);
    expect(doble.transaccion).toHaveBeenCalledOnce();
    expect(doble.consultas).toHaveLength(1);
  });
  it("logout restringe la eliminación al identificador y dueño, nunca a todas sus sesiones", async () => {
    await sesionesRepository.deleteById(sesion.id, 7);
    expect(doble.consultas).toEqual([{
      sql: 'delete from "sesiones" where ("sesiones"."id" = $1 and "sesiones"."usuario_id" = $2)',
      parametros: [sesion.id, 7],
    }]);
  });
  it("consulta incluye usuario vigente por join sin seleccionar credenciales", async () => {
    expect(await sesionesRepository.findById(sesion.id)).toBeUndefined();
    expect(doble.consultas[0].sql).toContain('inner join "usuarios"');
    expect(doble.consultas[0].sql).not.toMatch(/clave|version_sesion/);
    expect(doble.consultas[0].parametros).toEqual([sesion.id, 1]);
  });
  it("declara la baja en cascada de sesiones en el esquema, sin afirmar ejecución SQL", () => {
    const configuracion = getTableConfig(sesiones);
    expect(configuracion.foreignKeys).toHaveLength(1);
    expect(configuracion.foreignKeys[0].onDelete).toBe("cascade");
    expect(configuracion.foreignKeys[0].reference().columns).toEqual([sesiones.usuarioId]);
  });
});
