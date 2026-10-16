import test from "node:test";
import assert from "node:assert/strict";
import * as permisos from "./permisos.ts";

// La proyección elimina campos adicionales aunque el servidor los incluya.
test("datos seguros y filtros combinables sin mutar respuestas", async () => {
  const { seleccionarProfesor, filtrarProfesores } = await import("./datos.ts");
  const respuesta = {
    id: 1, nombre: "Ana Pérez", departamentoId: 1, tipo: "part time", usuarioId: 7,
    departamento: { id: 1, nombre: "Departamento", carreraDepartamentos: [{ esGestionado: true }] },
    usuario: { id: 7, nombre: "Ana Pérez", correo: "ana@example.cl", rol: "profesor", clave: "valor-sintetico" },
    ofertas: [],
  };
  const profesor = seleccionarProfesor(respuesta);
  assert.equal("clave" in profesor.usuario, false);
  assert.equal("ofertas" in profesor, false);
  assert.equal("carreraDepartamentos" in profesor.departamento, false);
  assert.equal(respuesta.usuario.clave, "valor-sintetico");
  const sinAcceso = { ...profesor, id: 2, usuarioId: null, usuario: null };
  assert.deepEqual(filtrarProfesores([profesor, sinAcceso], {
    busqueda: "  ANA pérez ", departamentoId: 1, tipo: "part time", acceso: "con acceso",
  }), [profesor]);
  assert.deepEqual(filtrarProfesores([profesor, sinAcceso], { acceso: "sin acceso" }), [sinAcceso]);
  assert.deepEqual(filtrarProfesores([profesor], { departamentoId: 2 }), []);
  assert.deepEqual(filtrarProfesores([profesor], { tipo: "planta" }), []);
});

test("edición de acceso admite correo o contraseña sin reenviar valores sin cambios", async () => {
  const { prepararCambiosAcceso } = await import("./formularios.ts");
  assert.deepEqual(prepararCambiosAcceso(" nueva@example.cl ", "", "anterior@example.cl"), { correo: "nueva@example.cl" });
  assert.deepEqual(prepararCambiosAcceso("igual@example.cl", "nueva-clave", "igual@example.cl"), { clave: "nueva-clave" });
  assert.deepEqual(prepararCambiosAcceso("", "nueva-clave", "antes@example.cl"), { clave: "nueva-clave" });
  assert.equal(prepararCambiosAcceso("igual@example.cl", "", "igual@example.cl"), null);
  assert.deepEqual(prepararCambiosAcceso("otro@example.cl", " clave ", "antes@example.cl"), { correo: "otro@example.cl", clave: " clave " });
});

test("etiquetas exactas y tipos desconocidos sin permisos de secretaria", async () => {
  const { etiquetaTipoProfesor } = await import("./datos.ts");
  assert.equal(etiquetaTipoProfesor("planta"), "Planta");
  assert.equal(etiquetaTipoProfesor("part time"), "Part time");
  for (const tipo of ["Jornada Completa", "Planta", "PART TIME", "otro", ""]) {
    assert.equal(etiquetaTipoProfesor(tipo), `Tipo no reconocido (${tipo})`);
    assert.equal(permisos.puedeAdministrarProfesor("secretaria", { ...propio, tipo }, alcance), false);
    assert.equal(permisos.puedeAdministrarAcceso("secretaria", { ...propio, tipo }, alcance), false);
  }
});

const carreras = [{ id: 10, nombre: "Carrera", carreraDepartamentos: [
  { departamentoId: 1, esGestionado: true },
  { departamentoId: 2, esGestionado: false },
] }];
const alcance = { departamentosIds: [1, 2], departamentosGestionadosIds: [1] };
const propio = { departamentoId: 1, tipo: "part time" };
const externo = { departamentoId: 2, tipo: "part time" };

test("solo admin y secretaria reciben acceso a gestión", () => {
  assert.equal(permisos.puedeGestionarProfesores("admin"), true);
  assert.equal(permisos.puedeGestionarProfesores("secretaria"), true);
  for (const rol of [undefined, "profesor", "otro", ""]) {
    assert.equal(permisos.puedeGestionarProfesores(rol), false);
  }
});

test("alcance deriva de carreras autenticadas, con gestión separada", () => {
  assert.deepEqual(permisos.derivarAlcanceProfesores(carreras), alcance);
  assert.deepEqual(permisos.derivarAlcanceProfesores([]), {
    departamentosIds: [], departamentosGestionadosIds: [],
  });
  assert.deepEqual(permisos.derivarAlcanceProfesores([...carreras, ...carreras]), alcance);
});

test("secretaria gestiona datos part time relacionados, acceso solo propio", () => {
  assert.equal(permisos.puedeAdministrarProfesor("secretaria", externo, alcance), true);
  assert.equal(permisos.puedeAdministrarAcceso("secretaria", externo, alcance), false);
  assert.equal(permisos.puedeAdministrarAcceso("secretaria", propio, alcance), true);
  for (const profesor of [{ ...propio, tipo: "planta" }, { ...propio, departamentoId: 3 }]) {
    assert.equal(permisos.puedeAdministrarProfesor("secretaria", profesor, alcance), false);
    assert.equal(permisos.puedeAdministrarAcceso("secretaria", profesor, alcance), false);
  }
  assert.equal(permisos.puedeAdministrarProfesor("secretaria", propio), false);
  assert.equal(permisos.puedeAdministrarAcceso("secretaria", propio), false);
});

test("admin no depende de alcance; otros roles no administran", () => {
  for (const rol of ["admin", "profesor", undefined]) {
    assert.equal(permisos.puedeAdministrarProfesor(rol, propio), rol === "admin");
    assert.equal(permisos.puedeAdministrarAcceso(rol, propio), rol === "admin");
  }
});
