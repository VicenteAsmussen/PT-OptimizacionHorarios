import test from "node:test";
import assert from "node:assert/strict";
import * as permisos from "./permisos.ts";

test("RUT normaliza formatos convencionales con paridad backend", async () => {
  const { normalizarRut } = await import("./rut.ts");
  for (const [entrada, esperado] of [
    ["12.345.678-5", "12345678-5"], ["123456785", "12345678-5"],
    ["  6.000.000-k  ", "6000000-K"], ["6000000K", "6000000-K"],
    ["6-k", "6-K"], ["6k", "6-K"], ["1-9", "1-9"], ["14-0", "14-0"],
    ["00.000.006-k", "6-K"], ["00000019", "1-9"],
    ["1.234.5674", "1234567-4"], ["1234567-4", "1234567-4"],
  ]) assert.equal(normalizarRut(entrada), esperado, entrada);
});

test("RUT rechaza vacíos, DV incorrecto, cuerpo nulo y formatos malformados", async () => {
  const { normalizarRut } = await import("./rut.ts");
  for (const entrada of [null, undefined, 123456785, "", "  ", "K", "0-0", "00000000-0",
    "12.345.678-9", "6-0", "123456789-2", "123.456.789-2", "12.34.567-4",
    "12 345 678-5", "RUT:12.345.678-5", "12.345.678--5", "12.345.678-5!", "-6K",
  ]) assert.equal(normalizarRut(entrada), null, String(entrada));
});

test("payload de profesor valida antes del envío y conserva solo datos canónicos", async () => {
  const { prepararDatosProfesor } = await import("./rut.ts");
  const entrada = { rut: " 12.345.678-5 ", nombre: " Ana Pérez ", departamentoId: 2, tipo: "planta", usuarioId: 9 };
  assert.deepEqual(prepararDatosProfesor(entrada), {
    rut: "12345678-5", nombre: "Ana Pérez", departamentoId: 2, tipo: "planta",
  });
  assert.equal(entrada.rut, " 12.345.678-5 ");
  assert.deepEqual(prepararDatosProfesor({ ...entrada, rut: "6-k", tipo: "part time" }), {
    rut: "6-K", nombre: "Ana Pérez", departamentoId: 2, tipo: "part time",
  });
  for (const rut of ["12.345.678-5", "12345678-5", "  6-k  ", "1-9", "14-0", "00.000.006-k"]) {
    assert.ok(prepararDatosProfesor({ ...entrada, rut }).rut, rut);
  }
  for (const rut of ["6k", "123456785", "1.234.5674", "", " ", "12.345.678-9",
    "00000000006-k", "000.000.006-k", "12.345.678--5", "12.345.678-5!"]) {
    assert.throws(() => prepararDatosProfesor({ ...entrada, rut }), /Ingresa un RUT válido.*guion obligatorio/, rut);
  }
  assert.throws(() => prepararDatosProfesor({ ...entrada, nombre: " " }), /Ingresa el nombre/);
});

test("formulario conecta edición y creación al payload validado y RUT accesible", async () => {
  const { readFile } = await import("node:fs/promises");
  const fuente = await readFile(new URL("./FormularioProfesor.tsx", import.meta.url), "utf8");
  assert.match(fuente, /useState\(profesor\?\.rut \?\? ""\)/);
  assert.match(fuente, /const datos = prepararDatosProfesor\(\{ rut, nombre, departamentoId, tipo \}\)/);
  assert.match(fuente, /profesoresApi\.editar\(profesor\.id, datos\)/);
  assert.match(fuente, /profesoresApi\.crear\(\{ \.\.\.datos,/);
  assert.match(fuente, /<label htmlFor="profesor-rut">RUT<\/label>/);
  assert.match(fuente, /<input id="profesor-rut" type="text" required autoComplete="off"/);
  assert.match(fuente, /aria-describedby="ayuda-profesor-rut"/);
  const ayudaRut = fuente.match(/<p id="ayuda-profesor-rut"[^>]*>([^<]*)<\/p>/)?.[1];
  assert.ok(ayudaRut?.includes("El guion es obligatorio; los puntos son opcionales y el dígito verificador puede ser K."));
  assert.doesNotMatch(ayudaRut, /12\.345\.678-5|Por ejemplo/);
  assert.match(fuente, /<label htmlFor="profesor-nombre">Nombre<\/label>/);
  const entradaNombre = fuente.match(/<input id="profesor-nombre"[\s\S]*?\/>/)?.[0];
  const entradaRut = fuente.match(/<input id="profesor-rut"[\s\S]*?\/>/)?.[0];
  assert.ok(entradaNombre);
  assert.ok(entradaRut);
  assert.match(entradaNombre, /placeholder="Ej\.: Ana Pérez"/);
  assert.match(entradaRut, /placeholder="Ej\.: 12\.345\.678-5"/);
  assert.match(entradaNombre, /\brequired\b/);
  assert.match(entradaNombre, /\bautoFocus\b/);
  assert.match(entradaNombre, /value=\{nombre\}/);
  assert.match(entradaNombre, /setNombre\(evento\.target\.value\)/);
  assert.match(entradaRut, /maxLength=\{12\}/);
  assert.match(entradaRut, /title="[^"]*guion obligatorio[^"]*"/);
  const patronRut = entradaRut.match(/pattern="([^"]+)"/)?.[1];
  assert.ok(patronRut);
  const formatoRut = new RegExp(`^(?:${patronRut})$`, "v");
  for (const rut of ["12.345.678-5", "12345678-5", "6-k", "1-9", "1.234-5", "123.456-7"]) {
    assert.ok(formatoRut.test(rut), rut);
  }
  for (const rut of ["123456785", "6k", "12.34.567-4", "123.456.789-2", "12.345.678--5", "6-X"]) {
    assert.equal(formatoRut.test(rut), false, rut);
  }
  assert.match(entradaRut, /value=\{rut\}/);
  assert.match(entradaRut, /setRut\(evento\.target\.value\)/);
});

test("búsqueda por RUT admite formato, compacto, parciales y K sin exigir DV válido", async () => {
  const { filtrarProfesores } = await import("./datos.ts");
  const profesores = [
    { id: 1, nombre: "Ana", rut: "12345678-5" },
    { id: 2, nombre: "Beatriz", rut: "6.000.000-k" },
    { id: 3, nombre: "Zulema", rut: "6-K" },
    { id: 4, nombre: "Sin dato" },
  ];
  for (const busqueda of ["12.345.678-5", "123456785", " 12345678-5 ", "3456", "6785", "678-5"]) {
    assert.deepEqual(filtrarProfesores(profesores, { busqueda }), [profesores[0]], busqueda);
  }
  for (const busqueda of ["6.000.000-k", "6000000K", "000k"]) {
    assert.deepEqual(filtrarProfesores(profesores, { busqueda }), [profesores[1]], busqueda);
  }
  assert.deepEqual(filtrarProfesores(profesores, { busqueda: "k" }), [profesores[1], profesores[2]]);
  for (const busqueda of [".", "-", "...---", "abc!", "!", "123!", "12 345", "RUT:123456785"]) {
    assert.deepEqual(filtrarProfesores(profesores, { busqueda }), [], busqueda);
  }
  assert.deepEqual(filtrarProfesores(profesores, { busqueda: "  bEaTrIz " }), [profesores[1]]);
  assert.equal(filtrarProfesores(profesores, { busqueda: "   " }).length, 4);
});

test("búsqueda RUT combina filtros y mantiene A–Z estable sin mutar entradas", async () => {
  const { filtrarProfesores } = await import("./datos.ts");
  const base = { rut: "12345678-5", departamentoId: 1, tipo: "planta", usuarioId: 7 };
  const profesores = Object.freeze([
    { ...base, id: 1, nombre: "Zara" },
    { ...base, id: 2, nombre: "álvaro" },
    { ...base, id: 3, nombre: "ÁLVARO" },
    { ...base, id: 4, nombre: "Ana", departamentoId: 2 },
    { ...base, id: 5, nombre: "Abel", tipo: "part time" },
    { ...base, id: 6, nombre: "Adela", usuarioId: null },
  ].map(Object.freeze));
  const filtros = Object.freeze({ busqueda: " 345.678-5 ", departamentoId: 1, tipo: "planta", acceso: "con acceso" });
  const antes = JSON.stringify({ profesores, filtros });
  assert.deepEqual(filtrarProfesores(profesores, filtros), [profesores[1], profesores[2], profesores[0]]);
  assert.deepEqual(filtrarProfesores(profesores, { ...filtros, acceso: "sin acceso" }), [profesores[5]]);
  assert.equal(JSON.stringify({ profesores, filtros }), antes);
});

test("formato de detalle agrupa cuerpo corto y largo, DV K y ausencia sin inventar RUT", async () => {
  const { formatearRut } = await import("./rut.ts");
  for (const [entrada, esperado] of [
    ["12345678-5", "12.345.678-5"], ["123456785", "12.345.678-5"],
    [" 6.000.000-k ", "6.000.000-K"], ["6k", "6-K"], ["1-9", "1-9"], ["14-0", "14-0"],
    [undefined, "Sin RUT"], [null, "Sin RUT"], ["", "Sin RUT"], ["  ", "Sin RUT"],
    ["dato inesperado", "dato inesperado"],
  ]) assert.equal(formatearRut(entrada), esperado, String(entrada));
});

test("RUT solo en detalle ver, tabla sin RUT y búsqueda rotulada nombre o RUT", async () => {
  const { readFile } = await import("node:fs/promises");
  const acciones = await readFile(new URL("./AccionesProfesor.tsx", import.meta.url), "utf8");
  const bloqueVer = acciones.match(/accion === "ver" \? <dl>([\s\S]*?)<\/dl>/)?.[1];
  assert.ok(bloqueVer);
  assert.match(bloqueVer, /<dt>RUT<\/dt><dd>\{formatearRut\(profesor\.rut\)\}<\/dd>/);
  assert.equal(acciones.match(/<dt>RUT<\/dt>/g)?.length, 1);
  assert.equal(acciones.replace(bloqueVer, "").includes("profesor.rut"), false);
  const tabla = await readFile(new URL("./TablaProfesores.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(tabla, /\brut\b/i);
  const pagina = await readFile(new URL("./ProfesoresPage.tsx", import.meta.url), "utf8");
  assert.match(pagina, /<label>Buscar por nombre o RUT<input/);
  assert.match(pagina, /placeholder="Buscar por nombre o RUT"/);
});

// La proyección elimina campos adicionales aunque el servidor los incluya.
test("datos seguros y filtros combinables sin mutar respuestas", async () => {
  const { seleccionarProfesor, filtrarProfesores } = await import("./datos.ts");
  const respuesta = {
    id: 1, rut: "12345678-5", nombre: "Ana Pérez", departamentoId: 1, tipo: "part time", usuarioId: 7,
    departamento: { id: 1, nombre: "Departamento", carreraDepartamentos: [{ esGestionado: true }] },
    usuario: { id: 7, nombre: "Ana Pérez", correo: "ana@example.cl", rol: "profesor", clave: "valor-sintetico" },
    ofertas: [],
  };
  const profesor = seleccionarProfesor(respuesta);
  assert.equal(profesor.rut, "12345678-5");
  assert.deepEqual(Object.keys(profesor).sort(), ["departamento", "departamentoId", "id", "nombre", "rut", "tipo", "usuario", "usuarioId"]);
  assert.deepEqual(Object.keys(profesor.usuario).sort(), ["correo", "id", "nombre", "rol"]);
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

test("profesores se ordenan A–Z en español sin distinguir mayúsculas ni acentos", async () => {
  const { filtrarProfesores } = await import("./datos.ts");
  const nombres = ["Zulema", "álvaro", "ana", "ÁLVARO", "Beatriz", "alvaro", "Ñora", "Nora"];
  const profesores = Object.freeze(nombres.map((nombre, id) => Object.freeze({ id, nombre })));
  const resultado = filtrarProfesores(profesores);
  assert.deepEqual(resultado.map((profesor) => profesor.id), [1, 3, 5, 2, 4, 7, 6, 0]);
  assert.notEqual(resultado, profesores);
  assert.deepEqual(profesores.map((profesor) => profesor.nombre), nombres);
  assert.deepEqual(resultado.map((profesor) => profesor.nombre), [
    "álvaro", "ÁLVARO", "alvaro", "ana", "Beatriz", "Nora", "Ñora", "Zulema",
  ]);
  for (const profesor of resultado) assert.equal(profesor, profesores[profesor.id]);
});

test("el orden se aplica tras combinar filtros sin cambiar la búsqueda por acentos", async () => {
  const { filtrarProfesores } = await import("./datos.ts");
  const base = { departamentoId: 1, tipo: "part time", usuarioId: 7 };
  const profesores = [
    { ...base, id: 1, nombre: "Zara" },
    { ...base, id: 2, nombre: "Ana" },
    { ...base, id: 3, nombre: "Aarón", departamentoId: 2 },
    { ...base, id: 4, nombre: "Abel", tipo: "planta" },
    { ...base, id: 5, nombre: "Adela", usuarioId: null },
    { ...base, id: 6, nombre: "Ágata" },
  ];
  const filtros = { busqueda: " A ", departamentoId: 1, tipo: "part time", acceso: "con acceso" };
  assert.deepEqual(filtrarProfesores(profesores, filtros).map((profesor) => profesor.id), [6, 2, 1]);
  assert.deepEqual(filtrarProfesores(profesores, { busqueda: "agata" }), []);
  assert.deepEqual(filtrarProfesores(profesores, { busqueda: "ÁGATA" }), [profesores[5]]);
  assert.deepEqual(filtrarProfesores([]), []);
  assert.deepEqual(filtrarProfesores([profesores[0]]), [profesores[0]]);
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
