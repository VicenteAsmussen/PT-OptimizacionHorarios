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
    expect(datosDepartamentos).toHaveLength(10);
    expect(datosDepartamentos.every(departamento => departamento.nombre.startsWith("Departamento de "))).toBe(true);
    expect([...departamentosGestionados]).toEqual([
      "Departamento de Sistemas de Información",
      "Departamento de Administración y Auditoría",
      "Departamento de Economía y Finanzas",
    ]);
    expect([...departamentosGestionados].every(nombre => datosDepartamentos.some(departamento => departamento.nombre === nombre))).toBe(true);
  });

  it("creates 46 confirmed teachers with unique synthetic identities and the requested initial password", () => {
    expect(claveInicial).toBe("123456");
    expect(datosProfesores).toHaveLength(46);
    expect(new Set(datosProfesores.map(profesor => profesor.rut)).size).toBe(46);
    expect(new Set(datosProfesores.map(profesor => profesor.correo)).size).toBe(46);
    for (const profesor of datosProfesores) {
      expect(["planta", "part time"]).toContain(profesor.tipo);
      expect(normalizarRut(profesor.rut)).toBe(profesor.rut);
      expect(profesor.correo).toMatch(/^[a-z]+@ubb\.cl$/);
      expect(datosDepartamentos.some(departamento => departamento.nombre === profesor.departamento)).toBe(true);
      expect(datosUsuarios.find(usuario => usuario.correo === profesor.correo)).toMatchObject({ nombre: profesor.nombre, rol: "profesor" });
    }
    expect(datosUsuarios.filter(usuario => usuario.rol !== "profesor").map(usuario => usuario.correo)).toEqual(["admin@ubiobio.cl", "secretaria@ubiobio.cl"]);
  });

  it("uses the confirmed departments and contracts for the additional workbook teachers", () => {
    expect(datosProfesores.slice(21).map(({ nombre, correo, departamento, tipo }) => [
      nombre, correo, departamento.replace("Departamento de ", ""), tipo,
    ])).toEqual([
      ["Claudio Orlando Gutiérrez Soto", "cgutierrez@ubb.cl", "Sistemas de Información", "planta"],
      ["Mónica Alejandra Caniupán Marileo", "mcaniupan@ubb.cl", "Sistemas de Información", "planta"],
      ["Valeria Soledad Beratto Ulloa", "vberatto@ubb.cl", "Sistemas de Información", "planta"],
      ["Sergio Araya", "saraya@ubb.cl", "Sistemas de Información", "planta"],
      ["Alejandro Valdes", "avaldes@ubb.cl", "Sistemas de Información", "planta"],
      ["Mauricio Fuenzalida", "mfuenzalida@ubb.cl", "Sistemas de Información", "planta"],
      ["Alejandra Segura", "asegura@ubb.cl", "Sistemas de Información", "planta"],
      ["Sebastian Espinoza", "sespinoza@ubb.cl", "Sistemas de Información", "planta"],
      ["Tatiana Gutierrez", "tgutierrez@ubb.cl", "Sistemas de Información", "planta"],
      ["Ariel Andia", "aandia@ubb.cl", "Sistemas de Información", "planta"],
      ["Juan Carlos Parra", "jparra@ubb.cl", "Sistemas de Información", "planta"],
      ["Cuauhtémoc Trejo Cruz", "ctrejo@ubb.cl", "Física", "planta"],
      ["Juan Guillermo Rodríguez Santos", "jrodriguez@ubb.cl", "Estadística", "planta"],
      ["Valentina Duque Paz", "vduque@ubb.cl", "Estadística", "planta"],
      ["Gabriel Alexandro Cabezas Rivera", "gcabezas@ubb.cl", "Estudios Generales", "planta"],
      ["Mauricio Andre Leiva del Campo", "mleiva@ubb.cl", "Economía y Finanzas", "planta"],
      ["Erick Contreras", "econtreras@ubb.cl", "Administración y Auditoría", "part time"],
      ["Freddy Banda", "fbanda@ubb.cl", "Economía y Finanzas", "part time"],
      ["Cristian Pinto", "cpinto@ubb.cl", "Economía y Finanzas", "planta"],
      ["Luis Emilio Cabrera Crot", "lcabrera@ubb.cl", "Sistemas de Información", "planta"],
      ["Gabriel Rodolfo Lagos Aguayo", "glagos@ubb.cl", "Ingeniería Eléctrica y Electrónica", "planta"],
      ["Morin Antonia Órdenes Escobar", "mordenes@ubb.cl", "Física", "planta"],
      ["Jaime Alfredo Hernández Moraga", "jhernandez@ubb.cl", "Estudios Generales", "planta"],
      ["Lilian Viviana Velásquez Zapata", "lvelasquez@ubb.cl", "Estudios Generales", "planta"],
      ["Oscar Alejandro Cornejo Zúñiga", "ocornejo@ubb.cl", "Ingeniería Industrial", "planta"],
    ]);
    expect(datosProfesores.filter(profesor => profesor.tipo === "part time").map(profesor => profesor.correo))
      .toEqual(["econtreras@ubb.cl", "fbanda@ubb.cl"]);
  });

  it("includes DIEE as an external department eligible for the existing Excel import", () => {
    const departamento = "Departamento de Ingeniería Eléctrica y Electrónica";
    expect(datosDepartamentos.filter(dato => dato.nombre === departamento)).toHaveLength(1);
    expect(departamentosGestionados.has(departamento)).toBe(false);
    expect(datosProfesores.find(profesor => profesor.correo === "glagos@ubb.cl"))
      .toMatchObject({ nombre: "Gabriel Rodolfo Lagos Aguayo", departamento, tipo: "planta" });
  });

  it("preserves the original teachers' account identifiers and synthetic RUTs", () => {
    const correos = [
      "cvidal", "sparra", "crubio", "jmeza", "krojas", "osanmartin", "dsuarez", "enova",
      "pdamico", "bsandoval", "oparra", "bruf", "rahumada", "amaureira", "dparra", "jcampana",
      "hdiaz", "eriveros", "jandrade", "njara", "jbastias",
    ];
    const ruts = [
      "90000000-6", "90000001-4", "90000002-2", "90000003-0", "90000004-9", "90000005-7",
      "90000006-5", "90000007-3", "90000008-1", "90000009-K", "90000010-3", "90000011-1",
      "90000012-K", "90000013-8", "90000014-6", "90000015-4", "90000016-2", "90000017-0",
      "90000018-9", "90000019-7", "90000020-0",
    ];
    expect(datosProfesores.slice(0, 21).map(({ correo, rut, tipo }) => [correo, rut, tipo]))
      .toEqual(correos.map((correo, indice) => [`${correo}@ubb.cl`, ruts[indice], "planta"]));
  });

  it("excludes the retired teacher and reserves his RUT without renumbering the remaining identities", () => {
    expect(datosProfesores.some(profesor => profesor.correo === "jruiz@ubb.cl")).toBe(false);
    expect(datosUsuarios.some(usuario => usuario.correo === "jruiz@ubb.cl")).toBe(false);
    expect(datosProfesores.map(profesor => Number(profesor.rut.split("-")[0]))).toEqual([
      ...Array.from({ length: 21 }, (_, indice) => 90000000 + indice),
      ...Array.from({ length: 25 }, (_, indice) => 90000022 + indice),
    ]);
  });
});
