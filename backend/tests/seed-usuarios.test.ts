import { describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import * as esquema from "../src/db/schema/index.js";
import type { BaseDatosSeed, CatalogosAcademicosSeed } from "../src/db/seeds/contexto.js";
import { sembrarUsuarios } from "../src/db/seeds/usuarios.js";
import { hashPassword } from "../src/utils/password.js";
import { normalizarRut } from "../src/utils/rut.js";

vi.mock("../src/utils/password.js", () => ({ hashPassword: vi.fn(async () => "hash-simulado") }));

type Fila = Record<string, unknown>;
// Simula únicamente las operaciones del seed, sin importar el cliente ni configuración DB.
function crearBaseSimulada(conExistentes = false) {
  const usuarios: Fila[] = conExistentes ? [
    { id: 11, nombre: "Admin", correo: "admin@ubiobio.cl", rol: "admin", clave: "admin-conservada" },
    { id: 12, nombre: "Secretaria", correo: "secretaria@ubiobio.cl", rol: "secretaria", clave: "secretaria-conservada" },
    { id: 13, nombre: "Profesor Docente", correo: "profesor@ubiobio.cl", rol: "profesor", clave: "profesor-conservada" },
  ] : [];
  const profesores: Fila[] = conExistentes ? [
    { id: 71, nombre: "Profesor Docente", usuarioId: 13, departamentoId: 5, tipo: "Jornada Completa" },
  ] : [];
  const secretarias: Fila[] = conExistentes ? [{ id: 81, usuarioId: 12, carreraId: 10 }] : [];
  const tablas = new Map<unknown, Fila[]>([
    [esquema.usuarios, usuarios], [esquema.profesores, profesores], [esquema.secretarias, secretarias],
  ]);
  const dialecto = new PgDialect();
  function coincide(fila: Fila, condicion: SQL) {
    const consulta = dialecto.sqlToQuery(condicion);
    const columna = consulta.sql.includes('"correo"') ? "correo"
      : consulta.sql.includes('"usuario_id"') ? "usuarioId" : "id";
    return fila[columna] === consulta.params[0];
  }
  const baseDatos = {
    select: () => ({ from: (tabla: unknown) => ({ where: (condicion: SQL) => ({
      limit: async (limite: number) => tablas.get(tabla)!.filter((fila) => coincide(fila, condicion)).slice(0, limite),
    }) }) }),
    update: (tabla: unknown) => ({ set: (valores: Fila) => ({ where: (condicion: SQL) => {
      const filas = tablas.get(tabla)!.filter((fila) => coincide(fila, condicion));
      filas.forEach((fila) => Object.assign(fila, valores));
      return { returning: async () => filas };
    } }) }),
    insert: (tabla: unknown) => ({ values: (valores: Fila) => {
      const filas = tablas.get(tabla)!;
      const insertar = () => {
        const fila = { id: Math.max(0, ...filas.map((fila) => Number(fila.id))) + 1, ...valores };
        filas.push(fila);
        return [fila];
      };
      // Inserciones de perfiles se esperan directamente; usuarios usan returning.
      return {
        returning: async () => insertar(),
        onConflictDoUpdate: async ({ set }: { set: Fila }) => {
          const existente = filas.find((fila) => fila.usuarioId === valores.usuarioId);
          if (existente) Object.assign(existente, set); else insertar();
        },
        then: (resolver: (resultado: Fila[]) => unknown) => Promise.resolve(insertar()).then(resolver),
      };
    } }),
  } as unknown as BaseDatosSeed;
  return { baseDatos, usuarios, profesores, secretarias };
}

// El departamento objetivo no va primero: no depender del orden del catálogo.
const catalogos = {
  carreras: [{ id: 10, nombre: "Carrera" }],
  departamentos: [{ id: 99, nombre: "Otro" }, { id: 5, nombre: "Sistemas de Información" }],
} as CatalogosAcademicosSeed;

function comprobarProfesores(usuarios: Fila[], profesores: Fila[]) {
  expect(profesores).toHaveLength(2);
  expect(new Set(profesores.map((fila) => fila.rut)).size).toBe(2);
  for (const [correo, tipo, rut] of [["profesor@ubiobio.cl", "planta", "90000000-6"], ["profesor.parttime@ubiobio.cl", "part time", "90000001-4"]]) {
    const usuario = usuarios.find((fila) => fila.correo === correo);
    expect(usuario).toMatchObject({ rol: "profesor" });
    expect(profesores.find((fila) => fila.usuarioId === usuario?.id)).toMatchObject({
      nombre: usuario?.nombre, departamentoId: 5, tipo, rut,
    });
    expect(normalizarRut(rut)).toBe(rut);
  }
}

describe("seed de usuarios sin conexión a DB", () => {
  it("crea ambos tipos y repetirlo conserva IDs, vínculos y contraseñas sin volver a hashear", async () => {
    vi.mocked(hashPassword).mockClear();
    const { baseDatos, usuarios, profesores, secretarias } = crearBaseSimulada();
    await sembrarUsuarios(baseDatos, catalogos);
    comprobarProfesores(usuarios, profesores);
    expect(usuarios).toHaveLength(4);
    expect(usuarios.every((usuario) => usuario.clave === "hash-simulado")).toBe(true);
    expect(secretarias).toHaveLength(1);
    const estado = structuredClone({ usuarios, profesores, secretarias });
    vi.mocked(hashPassword).mockClear();
    await sembrarUsuarios(baseDatos, catalogos);
    expect({ usuarios, profesores, secretarias }).toEqual(estado);
    expect(hashPassword).not.toHaveBeenCalled();
  });

  it("reclasifica el perfil legado sin sustituir sus IDs ni enlaces y conserva admin/secretaria", async () => {
    const { baseDatos, usuarios, profesores, secretarias } = crearBaseSimulada(true);
    // Relaciones ajenas al seed apuntan a estos IDs; no deben necesitar reasignación.
    const enlaceHorario = { profesorId: 71 };
    await sembrarUsuarios(baseDatos, catalogos);
    comprobarProfesores(usuarios, profesores);
    expect(profesores.find((fila) => fila.id === enlaceHorario.profesorId)).toMatchObject({ usuarioId: 13, tipo: "planta" });
    for (const [id, clave] of [[11, "admin-conservada"], [12, "secretaria-conservada"], [13, "profesor-conservada"]]) {
      expect(usuarios.find((fila) => fila.id === id)?.clave).toBe(clave);
    }
    expect(secretarias).toEqual([{ id: 81, usuarioId: 12, carreraId: 10 }]);
    const estado = structuredClone({ usuarios, profesores, secretarias });
    await sembrarUsuarios(baseDatos, catalogos);
    expect({ usuarios, profesores, secretarias }).toEqual(estado);
  });
});
