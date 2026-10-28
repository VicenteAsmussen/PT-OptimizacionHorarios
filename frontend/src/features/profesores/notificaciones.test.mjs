import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

async function preparar() {
  const { crearNotificacionesProfesores } = await import("./notificaciones.ts");
  const eventos = [];
  let siguiente = 0;
  const avisos = Object.fromEntries(["exito", "advertencia", "cerrar"].map((tipo) => [tipo,
    (mensaje, id) => {
      eventos.push({ tipo, mensaje, id });
      return tipo === "cerrar" ? mensaje : id ?? ++siguiente;
    },
  ]));
  return { eventos, ciclo: crearNotificacionesProfesores(avisos) };
}

test("guardado se anuncia antes de la lectura y actualiza el mismo aviso", async () => {
  const { ciclo, eventos } = await preparar();
  ciclo.guardado(() => true);
  assert.match(eventos[0].mensaje, /Cambios guardados/);
  ciclo.resultado(true, () => true);
  assert.equal(eventos.length, 2);
  assert.equal(eventos[1].tipo, "exito");
  assert.equal(eventos[1].id, 1);
  assert.match(eventos[1].mensaje, /Lista actualizada/);
});

test("fallo de refresco conserva éxito de escritura y reintento solo actualiza aviso", async () => {
  const { ciclo, eventos } = await preparar();
  ciclo.resultado(false, () => true);
  assert.equal(eventos.length, 0, "error inicial de lectura no es una mutación");
  ciclo.guardado(() => true);
  ciclo.resultado(false, () => true);
  assert.equal(eventos[1].tipo, "advertencia");
  assert.equal(eventos[1].mensaje, "Cambios guardados, pero no se pudo actualizar la lista.");
  assert.equal(eventos[1].id, 1);
  ciclo.resultado(true, () => true);
  assert.equal(eventos[2].tipo, "exito");
  assert.equal(eventos[2].id, 1, "reemplaza el fallo persistente tras reintentar");
  ciclo.resultado(true, () => true);
  assert.equal(eventos.length, 3, "lecturas normales no duplican éxitos");
});

test("respuestas obsoletas y desmontaje no generan notificaciones", async () => {
  const { ciclo, eventos } = await preparar();
  ciclo.guardado(() => false);
  assert.equal(eventos.length, 0);
  ciclo.guardado(() => true);
  ciclo.resultado(false, () => false);
  assert.equal(eventos.length, 1);
  ciclo.limpiar();
  assert.equal(eventos[1].tipo, "cerrar");
  ciclo.resultado(false, () => true);
  ciclo.guardado(() => false);
  assert.equal(eventos.length, 2);
});

test("una lectura tardía no sobrescribe el aviso de una operación posterior", async () => {
  const { ciclo, eventos } = await preparar();
  let solicitud = 1;
  let resolver;
  const lecturaAnterior = new Promise((resolverLectura) => { resolver = resolverLectura; });
  const numero = solicitud;
  ciclo.guardado(() => true);
  const resultadoAnterior = lecturaAnterior.then(() => ciclo.resultado(false, () => numero === solicitud));
  solicitud++;
  ciclo.guardado(() => true);
  ciclo.resultado(true, () => true);
  const antes = eventos.length;
  resolver();
  await resultadoAnterior;
  assert.equal(eventos.length, antes);
  assert.equal(eventos.at(-1).tipo, "exito");
});

test("operaciones repetidas usan avisos independientes sin arrastrar fallos", async () => {
  const { ciclo, eventos } = await preparar();
  ciclo.guardado(() => true);
  ciclo.resultado(false, () => true);
  ciclo.guardado(() => true);
  assert.equal(eventos[2].tipo, "cerrar");
  ciclo.resultado(true, () => true);
  assert.equal(eventos.at(-1).id, 2);
});

test("adaptador aplica duración y cierre a éxitos, advertencias y errores reales", async () => {
  const { notificaciones } = await import("../../lib/notificaciones.ts");
  const { toast } = await import("sonner");
  for (const [tipo, duracion] of [["exito", 5000], ["advertencia", 5000], ["error", 5000]]) {
    const id = notificaciones[tipo](`Prueba ${tipo}`);
    const aviso = toast.getHistory().find((aviso) => aviso.id === id);
    assert.equal(aviso.duration, duracion);
    assert.equal(aviso.closeButton, true);
    // No montar ni descartar en Node: el descarte usa requestAnimationFrame del navegador.
  }
});

test("política central y un único Toaster global con etiquetas españolas", async () => {
  const adaptador = await readFile(new URL("../../lib/notificaciones.ts", import.meta.url), "utf8");
  const app = await readFile(new URL("../../App.tsx", import.meta.url), "utf8");
  const componente = await readFile(new URL("../../components/notificaciones/Notificaciones.tsx", import.meta.url), "utf8");
  const pagina = await readFile(new URL("./ProfesoresPage.tsx", import.meta.url), "utf8");
  assert.match(adaptador, /exito:[\s\S]*?duration: 5000/);
  assert.match(adaptador, /error:[\s\S]*?duration: 5000/);
  assert.match(adaptador, /advertencia:[\s\S]*?duration: 5000/);
  assert.equal(app.match(/<Notificaciones\s*\/>/g)?.length, 1);
  assert.equal(componente.match(/<Toaster\b/g)?.length, 1);
  assert.match(componente, /closeButton/);
  assert.match(componente, /position="top-right"/);
  assert.match(componente, /containerAriaLabel="Notificaciones"/);
  assert.match(componente, /closeButtonAriaLabel: "Cerrar notificación"/);
  assert.doesNotMatch(pagina, /setAviso|Operación completada\./);
  assert.match(pagina, /numero === solicitud.current/);
  assert.match(pagina, /Reintentar carga/);
});
