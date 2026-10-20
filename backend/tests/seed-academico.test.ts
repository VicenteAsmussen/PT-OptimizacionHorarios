import { describe, expect, it } from "vitest";
import { datosAsignaturas, datosDepartamentos, departamentosGestionados } from "../src/db/seeds/data/academico.js";
import { claveInicial, datosProfesores, datosUsuarios } from "../src/db/seeds/data/usuarios.js";
import { normalizarRut } from "../src/utils/rut.js";

describe("workbook academic seed", () => {
  it("includes exactly the 15 taught courses from the first four curriculum semesters", () => {
    expect(datosAsignaturas.map(asignatura => asignatura.codigo)).toEqual([
      "220143", "620431", "220144", "210020", "620433", "620434", "220145", "220146",
      "230033", "620435", "220147", "230034", "220148", "620436", "340277",
    ]);
    expect(datosAsignaturas.every(asignatura => asignatura.semestreMalla >= 1 && asignatura.semestreMalla <= 4)).toBe(true);
    expect(datosAsignaturas.every(asignatura => asignatura.carreras.length === 1 && asignatura.carreras[0] === "Ingeniería Civil en Informática")).toBe(true);
  });

  it("keeps workbook hour counts and confirmed departments without guessing schedules", () => {
    const esperado = [
      ["Matemática", 4, 4, 0], ["Sistemas de Información", 5, 2, 2], ["Matemática", 4, 2, 0],
      ["Química", 6, 0, 0], ["Sistemas de Información", 4, 2, 2], ["Sistemas de Información", 4, 0, 0],
      ["Matemática", 4, 2, 0], ["Matemática", 4, 2, 0], ["Física", 6, 0, 0],
      ["Sistemas de Información", 3, 2, 2], ["Matemática", 4, 2, 0], ["Física", 6, 0, 0],
      ["Matemática", 4, 2, 0], ["Sistemas de Información", 4, 2, 0], ["Estudios Generales", 4, 0, 0],
    ];
    expect(datosAsignaturas.map(asignatura => [asignatura.departamento.replace("Departamento de ", ""), ...asignatura.horas])).toEqual(esperado);
    expect(datosDepartamentos).toHaveLength(7);
    expect([...departamentosGestionados]).toEqual(["Departamento de Sistemas de Información"]);
  });

  it("creates 22 plant teachers with unique synthetic identities and the requested initial password", () => {
    expect(claveInicial).toBe("123456");
    expect(datosProfesores).toHaveLength(22);
    expect(new Set(datosProfesores.map(profesor => profesor.rut)).size).toBe(22);
    expect(new Set(datosProfesores.map(profesor => profesor.correo)).size).toBe(22);
    for (const profesor of datosProfesores) {
      expect(profesor.tipo).toBe("planta");
      expect(normalizarRut(profesor.rut)).toBe(profesor.rut);
      expect(profesor.correo).toMatch(/^[a-z]+@ubb\.cl$/);
      expect(datosDepartamentos.some(departamento => departamento.nombre === profesor.departamento)).toBe(true);
      expect(datosUsuarios.find(usuario => usuario.correo === profesor.correo)).toMatchObject({ nombre: profesor.nombre, rol: "profesor" });
    }
    expect(datosUsuarios.filter(usuario => usuario.rol !== "profesor").map(usuario => usuario.correo)).toEqual(["admin@ubiobio.cl", "secretaria@ubiobio.cl"]);
  });
});
