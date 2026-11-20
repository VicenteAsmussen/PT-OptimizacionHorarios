import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createServer, type Server } from "node:http";
import { relative } from "node:path";
import { createHash } from "node:crypto";
import type { IncomingMessage } from "node:http";
import ExcelJS from "exceljs";
import { encabezadosExcelSalas } from "../../src/utils/excel/excel-salas.js";
import type { Application } from "express";
import request from "supertest";
import type { EntradaOptimizacion, SalidaOptimizacion } from "../../src/optimizacion/contrato.js";

const control = vi.hoisted(() => ({ cliente: undefined as ReturnType<typeof postgres> | undefined,
  entrada: undefined as EntradaOptimizacion | undefined, resolver: undefined as ((salida: SalidaOptimizacion) => void) | undefined }));
// Solo cambia la conexión del test. Los repositorios y permisos no se sustituyen.
vi.mock("../../src/config/db.js", async () => {
  const { drizzle } = await import("drizzle-orm/postgres-js");
  const esquema = await import("../../src/db/schema/index.js");
  if (!control.cliente) throw new Error("La aplicación no puede cargarse antes de verificar el cluster propio.");
  return { queryClient: control.cliente, db: drizzle(control.cliente, { schema: esquema }) };
});
vi.mock("../../src/config/env.js", () => ({ env: {
  NODE_ENV: "test", PORT: 3000, CLIENT_URL: "http://127.0.0.1", DATABASE_URL: process.env.DEMOSTRACION_URL,
  JWT_SECRET: "secreto-sintetico-exclusivo-del-escenario-fase2", JWT_EXPIRES_IN: "8h",
} }));
// Patrón de integracion/optimizacion-http.postgres.test.ts: nunca arranca Julia.
vi.mock("../../src/optimizacion/proceso.js", () => ({
  ejecutarJulia: (entrada: EntradaOptimizacion) => {
    control.entrada = entrada;
    return new Promise<SalidaOptimizacion>(resolver => { control.resolver = resolver; });
  }, cerrarProcesosJulia: () => {},
}));

describe("Demostración ficticia con SQL real y resultados sintéticos, sin Julia", () => {
  let app: Application;
  let servidor: Server;
  beforeAll(async () => {
    const destino = process.env.DEMOSTRACION_URL;
    if (process.env.DEMOSTRACION_AUTORIZADA !== "cluster-propio-sintetico" || !destino || !process.env.DEMOSTRACION_DATOS) {
      throw new Error("Ejecute únicamente el arnés de demostración autorizado.");
    }
    const url = new URL(destino);
    if (url.protocol !== "postgres:" || url.hostname !== "127.0.0.1" || url.port !== "55432"
      || url.pathname !== "/demo_tesis_fase2" || url.username !== "demo_tesis" || !url.password || url.search || url.hash) {
      throw new Error("Destino ajeno al escenario efímero.");
    }
    control.cliente = postgres(destino, { max: 1, connect_timeout: 5, onnotice: () => {} });
    const [identidad] = await control.cliente`select current_database() as base, current_user as usuario,
      host(inet_server_addr()) as direccion, inet_server_port() as puerto, current_setting('data_directory') as datos`;
    if (identidad?.base !== "demo_tesis_fase2" || identidad.usuario !== "demo_tesis" || identidad.direccion !== "127.0.0.1"
      || identidad.puerto !== 55432 || relative(realpathSync(identidad.datos), realpathSync(process.env.DEMOSTRACION_DATOS)) !== "") {
      throw new Error("La identidad SQL no coincide con el cluster recién creado. No se escribirá.");
    }
    await migrate(drizzle(control.cliente), { migrationsFolder: fileURLToPath(new URL("../../src/db/migrations", import.meta.url)) });
    ({ app } = await import("../../src/app.js"));
    servidor = createServer(app);
    await new Promise<void>(resolver => servidor.listen(0, "127.0.0.1", resolver));
  });
  afterAll(async () => {
    if (servidor?.listening) await new Promise<void>((resolver, rechazar) => servidor.close(error => error ? rechazar(error) : resolver()));
    await control.cliente?.end({ timeout: 5 });
  });
  it("aplica las migraciones desde vacío sin seed ni servicios existentes", async () => {
    const respuesta = await request(servidor).get("/api/health");
    expect(respuesta.status).toBe(200);
    expect(await control.cliente!`select * from usuarios`).toHaveLength(0);
  });
  async function huella() {
    const cliente = control.cliente!;
    const tablas = await cliente`select tablename from pg_tables where schemaname='public' order by tablename`;
    const datos = [];
    for (const { tablename } of tablas) datos.push([tablename,
      await cliente`select to_jsonb(fila) as datos from ${cliente(tablename)} fila order by to_jsonb(fila)::text`]);
    return createHash("sha256").update(JSON.stringify(datos)).digest("hex");
  }
  function binario(respuesta: IncomingMessage, terminar: (error: Error | null, cuerpo?: Buffer) => void) {
    const partes: Buffer[] = [];
    respuesta.on("data", parte => partes.push(Buffer.from(parte)));
    respuesta.on("end", () => terminar(null, Buffer.concat(partes)));
    respuesta.on("error", terminar);
  }
  async function libro(filas: (string | number)[][], externos = false) {
    const archivo = new ExcelJS.Workbook(); const hoja = archivo.addWorksheet(externos ? "Externos" : "Resumen Malla");
    hoja.addRow(externos ? [...encabezadosExcelSalas.slice(0, 4), "RUT Profesor", ...encabezadosExcelSalas.slice(4)] : [...encabezadosExcelSalas]);
    filas.forEach(fila => hoja.addRow(fila));
    return Buffer.from(await archivo.xlsx.writeBuffer());
  }
  it("recorre preparación, Excel, propuesta sintética, salas, publicación y consulta con permisos reales", async () => {
    const cliente = control.cliente!;
    const { hashPassword } = await import("../../src/utils/password.js");
    const clave = "Demostracion-ficticia-2099!";
    const hash = await hashPassword(clave);
    // Catálogos mínimos explícitos. No son una copia de la seed ni de una base existente.
    await cliente`insert into usuarios(id,nombre,correo,clave,rol) values
      (1,'Administrador ficticio','admin@example.test',${hash},'admin'),
      (2,'Secretaría ficticia','secretaria@example.test',${hash},'secretaria'),
      (3,'Secretaría ajena ficticia','ajena@example.test',${hash},'secretaria'),
      (4,'Docente uno ficticio','docente@example.test',${hash},'profesor'),
      (5,'Docente dos ficticio','docente2@example.test',${hash},'profesor')`;
    await cliente`insert into carreras(id,nombre) values(1,'Ingeniería Civil en Informática'),(2,'Carrera ficticia ajena')`;
    await cliente`insert into secretarias(usuario_id,carrera_id) values(2,1),(3,2)`;
    await cliente`insert into departamentos(id,nombre) values(1,'Gestionado ficticio'),(2,'Externo ficticio')`;
    await cliente`insert into carrera_departamento(carrera_id,departamento_id,es_gestionado) values(1,1,true),(1,2,false)`;
    await cliente`insert into asignaturas(codigo,nombre,departamento_id,semestre_malla) values
      ('DEMO101','Asignatura interna ficticia',1,2),('DEMO301','Segunda interna ficticia',1,4),('DEMOEXT','Asignatura externa ficticia',2,2)`;
    await cliente`insert into carrera_asignatura(carrera_id,asignatura_codigo) values(1,'DEMO101'),(1,'DEMO301'),(1,'DEMOEXT')`;
    await cliente`insert into profesores(id,usuario_id,departamento_id,rut,nombre,tipo) values
      (1,4,1,'11111111-1','Docente uno ficticio','planta'),(2,5,1,'22222222-2','Docente dos ficticio','planta'),
      (3,null,2,'12345678-5','Docente externo ficticio','planta')`;
    await cliente`insert into tipos_hora(id,tipo) values(1,'Teórica')`;
    await cliente`insert into asignatura_tipo_hora(asignatura_codigo,tipo_hora_id,horas) values('DEMO101',1,2),('DEMO301',1,2),('DEMOEXT',1,2)`;
    await cliente`insert into salas(id,nombre,capacidad,tipo) values(1,'A101AA',90,'Sala'),(2,'A102AA',90,'Sala')`;
    const comienzos = ["08:10", "08:50", "09:40", "10:20", "11:10", "11:50", "12:40", "13:20", "14:10", "14:50", "15:40", "16:20", "17:10", "17:50", "18:40", "19:20"];
    const terminos = ["08:50", "09:30", "10:20", "11:00", "11:50", "12:30", "13:20", "14:00", "14:50", "15:30", "16:20", "17:00", "17:50", "18:30", "19:20", "20:00"];
    for (const [dia, nombre] of ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes"].entries()) {
      for (let numero = 1; numero <= 16; numero++) await cliente`insert into bloques_horarios(id,dia,numero_bloque,hora_inicio,hora_termino)
        values(${dia * 16 + numero},${nombre},${numero},${comienzos[numero - 1]!},${terminos[numero - 1]!})`;
    }
    const agentes = Object.fromEntries(["admin", "secretaria", "ajena", "docente", "docente2"].map(rol => [rol, request.agent(servidor)]));
    for (const [rol, agente] of Object.entries(agentes)) {
      const login = await agente.post("/api/auth/login").send({ correo: `${rol}@example.test`, clave });
      expect(login.status, `login ${rol}`).toBe(200);
      expect(login.headers["set-cookie"]).toBeTruthy();
    }
    const { admin, secretaria, ajena, docente, docente2 } = agentes;
    const crearPeriodo = () => ({ carreraId: 1, codigo: "2099-2" });
    let previa = await huella();
    expect((await secretaria!.post("/api/planificaciones-semestres").send(crearPeriodo())).status).toBe(403);
    expect(await huella()).toBe(previa);
    const periodo = await admin!.post("/api/planificaciones-semestres").send(crearPeriodo());
    expect(periodo.status, JSON.stringify(periodo.body)).toBe(201);
    const id = periodo.body.data.id;
    expect(periodo.body.data).toMatchObject({ actual: true, estadoPlanificacion: "preparacion" });
    const rutaResultado = `/api/resultados-horarios/${id}`;
    previa = await huella();
    expect((await request(servidor).get(rutaResultado)).status).toBe(401);
    expect((await docente!.get(rutaResultado)).status).toBe(403);
    expect((await ajena!.get(rutaResultado)).status).toBe(404);
    expect(await huella()).toBe(previa);
    const ofertas: number[] = [];
    for (const [codigo, profesorId] of [["DEMO101", 1], ["DEMO301", 2]] as const) {
      const datos = { asignaturaCodigo: codigo, planificacionSemestreId: id, seccion: 1, cupos: 30, asignaciones: [{ tipoHoraId: 1, profesorId }] };
      previa = await huella();
      expect((await admin!.post("/api/ofertas-asignaturas").send(datos)).status).toBe(403);
      expect((await ajena!.post("/api/ofertas-asignaturas").send(datos)).status).toBe(404);
      expect(await huella()).toBe(previa);
      const respuesta = await secretaria!.post("/api/ofertas-asignaturas").send(datos);
      expect(respuesta.status, JSON.stringify(respuesta.body)).toBe(201);
      ofertas.push(respuesta.body.data.id);
    }
    for (const agente of [docente!, docente2!]) {
      const respuesta = await agente.post("/api/disponibilidad-profesores/mi-disponibilidad").send({ planificacionSemestreId: id, bloquesIds: [1, 2, 5, 6, 7, 8] });
      expect(respuesta.status, JSON.stringify(respuesta.body)).toBe(200);
    }
    expect(await cliente`select * from disponibilidad_profesores`).toHaveLength(12);
    previa = await huella();
    expect((await secretaria!.post("/api/disponibilidad-profesores/mi-disponibilidad").send({ planificacionSemestreId: id, bloquesIds: [1] })).status).toBe(403);
    expect((await docente!.post("/api/disponibilidad-profesores/mi-disponibilidad").send({ planificacionSemestreId: id, profesorId: 2, bloquesIds: [1] })).status).toBe(400);
    expect(await huella()).toBe(previa);
    expect((await secretaria!.get(`/api/disponibilidad-profesores/seguimiento?planificacionSemestreId=${id}`)).status).toBe(200);
    console.info("Comprobado: login, período, ofertas, asignaciones docentes, disponibilidad y alcance por rol/carrera.");

    const rutaExternos = `/api/horarios-asignaturas/excel/externos/importar?planificacionSemestreId=${id}&departamentoId=2`;
    const filaExterna = ["DEMOEXT", "Asignatura externa ficticia", 1, 30, "12.345.678-5", "Docente externo ficticio", "Teórica", "Lunes", "09:40-11:00", "Sala ignorada"];
    const importarExterno = (archivo: Buffer, nombre = "externos.xlsx", agente = secretaria!) => agente.post(rutaExternos).attach("archivo", archivo, nombre);
    const externa = await libro([filaExterna], true);
    previa = await huella();
    for (const [archivo, nombre] of [[Buffer.from("no es Excel"), "externos.xlsx"], [externa, "externos.csv"],
      [await libro([filaExterna, [...filaExterna.slice(0, 2), 2, 30, "", ...filaExterna.slice(5)]], true), "externos.xlsx"]] as const) {
      expect((await importarExterno(archivo, nombre)).status).toBe(400);
      expect(await huella()).toBe(previa);
    }
    expect((await importarExterno(externa, "externos.xlsx", admin!)).status).toBe(403);
    expect((await importarExterno(externa, "externos.xlsx", ajena!)).status).toBe(403);
    expect(await huella()).toBe(previa);
    const importada = await importarExterno(externa);
    expect(importada.status, JSON.stringify(importada.body)).toBe(201);
    expect(importada.body.data).toMatchObject({ ofertasCreadas: 1, horariosCreados: 2, errores: [] });
    expect(await cliente`select sala_id from horarios_asignaturas`).toEqual([{ sala_id: null }, { sala_id: null }]);
    const colision = [...filaExterna]; colision[2] = 2;
    previa = await huella();
    const conflicto = await importarExterno(await libro([filaExterna, colision], true));
    expect(conflicto.status).toBe(400); expect(await huella()).toBe(previa);
    console.info("Comprobado: externos, RUT ficticio, formatos inválidos, conflicto y rechazo íntegro de lote.");

    const cargaPendiente = await secretaria!.get(`${rutaResultado}/validacion-publicacion`);
    expect(cargaPendiente.body.data).toMatchObject({ valido: false,
      problemas: expect.arrayContaining([expect.objectContaining({ codigo: "carga" })]) });

    const inicio = await secretaria!.post(`/api/optimizacion/planificaciones/${id}/ejecuciones`).send({
      claveIdempotencia: "demostracion-fase2-sintetica", recursos: [{ id: "AA-Sala-90", edificio: "AA", tipo: "Sala", capacidad: 90, cantidad: 1, fuente: "ESCENARIO SINTÉTICO, NO MEDICIÓN DEL OPTIMIZADOR" }],
    });
    expect(inicio.status, JSON.stringify(inicio.body)).toBe(202);
    await vi.waitFor(() => expect(control.resolver).toBeTypeOf("function"));
    const entrada = control.entrada!;
    control.resolver!({ version: 1, revision: entrada.revision, estado: "optimo", objetivo: 0,
      asignaciones: ofertas.flatMap((ofertaId, indice) => (indice === 0 ? [1, 2] : [5, 6]).map(bloqueId => ({ ofertaId, tipoHoraId: 1, bloqueId, categoriaId: "AA-Sala-90" }))),
      faltantes: ofertas.map(ofertaId => ({ ofertaId, tipoHoraId: 1, horas: 0 })),
      protecciones: entrada.parejas.flatMap(pareja => pareja.seccionesA.flatMap(ofertaAId => pareja.seccionesB.map(ofertaBId => ({ parejaId: pareja.id, ofertaAId, ofertaBId, protegida: true })))),
    });
    await vi.waitFor(async () => {
      const estado = await secretaria!.get(`/api/optimizacion/ejecuciones/${inicio.body.data.id}`);
      expect(estado.body.data.estado, JSON.stringify(estado.body)).toBe("aplicada");
    }, { timeout: 15000, interval: 100 });
    let vista = await secretaria!.get(rutaResultado);
    expect(vista.status).toBe(200); expect(vista.body.data.sesiones).toHaveLength(3);
    const sesiones = vista.body.data.sesiones;
    const sesion = sesiones.find((fila: { ofertaId: number }) => fila.ofertaId === ofertas[0]);
    previa = await huella();
    const movimiento = { revision: vista.body.data.revision, idsHorarios: sesion.idsHorarios, bloqueInicioId: 3 };
    expect((await secretaria!.post(`${rutaResultado}/movimientos`).send(movimiento)).status).toBe(409);
    expect((await admin!.post(`${rutaResultado}/publicar`).send({ revision: vista.body.data.revision })).status).toBe(403);
    expect((await secretaria!.post(`${rutaResultado}/publicar`).send({ revision: vista.body.data.revision })).status).toBe(409);
    expect(await huella()).toBe(previa);
    const validacion = await secretaria!.get(`${rutaResultado}/validacion-publicacion`);
    expect(validacion.body.data.valido).toBe(false);
    expect(validacion.body.data.problemas).toEqual(expect.arrayContaining([expect.objectContaining({ codigo: "sala" })]));

    const exportada = await secretaria!.get(`${rutaResultado}/salas/exportar`).buffer(true).parse(binario);
    expect(exportada.status).toBe(200);
    expect(exportada.headers["content-type"]).toContain("spreadsheetml");
    const libroSalas = new ExcelJS.Workbook(); await libroSalas.xlsx.load(exportada.body);
    const hoja = libroSalas.worksheets[0]!;
    expect(hoja.getRow(1).values.slice(1)).toEqual([...encabezadosExcelSalas]);
    // La propuesta exporta solo sesiones gestionadas que solicitan sala, no las externas.
    expect(hoja.rowCount).toBe(3);
    for (let fila = 2; fila <= hoja.rowCount; fila++) expect(hoja.getCell(fila, 9).text).toBe("");
    const importarSalas = async (archivo: Buffer, revision?: string) => {
      const actual = await secretaria!.get(rutaResultado);
      return secretaria!.post(`${rutaResultado}/salas/importar`).field("revision", revision ?? actual.body.data.revision).attach("archivo", archivo, "salas.xlsx");
    };
    const filasSalas = [
      ["DEMO101", "Asignatura interna ficticia", 1, 30, "Docente uno ficticio", "Teórica", "Lunes", "08:10-09:30", "A101AA"],
      ["DEMO301", "Segunda interna ficticia", 1, 30, "Docente dos ficticio", "Teórica", "Lunes", "11:10-12:30", "NO-EXISTE"],
    ];
    previa = await huella();
    expect((await importarSalas(Buffer.from("archivo corrupto"))).status).toBe(400);
    expect((await importarSalas(await libro(filasSalas))).status).toBe(400);
    expect(await huella()).toBe(previa);
    filasSalas[1]![8] = "";
    expect((await importarSalas(await libro(filasSalas))).status).toBe(400);
    expect(await huella()).toBe(previa);
    filasSalas.forEach(fila => { fila[8] = "SIN SALA"; });
    const sinSala = await importarSalas(await libro(filasSalas));
    expect(sinSala.status, JSON.stringify(sinSala.body)).toBe(200);
    expect(sinSala.body.data.pendientes).toBe(2);
    expect(await huella()).toBe(previa);
    vista = await secretaria!.get(rutaResultado);
    expect((await secretaria!.post(`${rutaResultado}/publicar`).send({ revision: vista.body.data.revision })).status).toBe(409);
    expect(await huella()).toBe(previa);
    filasSalas.forEach(fila => { fila[8] = "A101AA"; });
    // Completar el archivo realmente descargado demuestra el intercambio de ida y vuelta.
    for (let fila = 2; fila <= hoja.rowCount; fila++) hoja.getCell(fila, 9).value = "A101AA";
    const archivoCompletado = Buffer.from(await libroSalas.xlsx.writeBuffer());
    const asignadas = await importarSalas(archivoCompletado);
    expect(asignadas.status, JSON.stringify(asignadas.body)).toBe(200);
    expect(await cliente`select sala_id from horarios_asignaturas where oferta_id in (${ofertas[0]!},${ofertas[1]!})`).toEqual(Array.from({ length: 4 }, () => ({ sala_id: 1 })));
    previa = await huella();
    expect((await importarSalas(await libro(filasSalas), vista.body.data.revision)).status).toBe(409);
    expect(await huella()).toBe(previa);
    const conSalas = await secretaria!.get(rutaResultado);
    const segundaSesion = conSalas.body.data.sesiones.find((fila: { ofertaId: number }) => fila.ofertaId === ofertas[1]);
    const choqueSala = { revision: conSalas.body.data.revision, idsHorarios: segundaSesion.idsHorarios, bloqueInicioId: 1 };
    const vistaChoque = await secretaria!.post(`${rutaResultado}/validar-movimiento`).send(choqueSala);
    expect(vistaChoque.body.data).toMatchObject({ valido: false,
      problemas: expect.arrayContaining([expect.objectContaining({ codigo: "salaOcupada" })]) });
    expect((await secretaria!.post(`${rutaResultado}/movimientos`).send(choqueSala)).status).toBe(409);
    expect(await huella()).toBe(previa);
    console.info("Comprobado: propuesta SINTÉTICA, movimiento conflictivo, Excel salas, SIN SALA y revisión obsoleta.");

    const lista = await secretaria!.get(`${rutaResultado}/validacion-publicacion`);
    expect(lista.body.data, JSON.stringify(lista.body)).toMatchObject({ valido: true, problemas: [] });
    vista = await secretaria!.get(rutaResultado);
    const publicada = await secretaria!.post(`${rutaResultado}/publicar`).send({ revision: vista.body.data.revision });
    expect(publicada.status, JSON.stringify(publicada.body)).toBe(200);
    expect((await cliente`select estado_planificacion from planificaciones_semestres where id=${id}`)[0]!.estado_planificacion).toBe("publicado");
    previa = await huella();
    expect((await secretaria!.post(`${rutaResultado}/movimientos`).send({ ...movimiento, revision: publicada.body.data.revision })).status).toBe(409);
    expect((await importarExterno(externa)).status).toBe(409);
    expect(await huella()).toBe(previa);
    const propio = await docente!.get(`/api/horarios-asignaturas/mi-horario?planificacionSemestreId=${id}`);
    expect(propio.status, JSON.stringify(propio.body)).toBe(200);
    expect(propio.body.data).toHaveLength(2);
    expect(propio.body.data.every((fila: { ofertaId: number; salaId: number }) => fila.ofertaId === ofertas[0] && fila.salaId === 1)).toBe(true);
    expect((await docente!.get(`/api/horarios-asignaturas/mi-horario?planificacionSemestreId=${id}&profesorId=2`)).status).toBe(400);
    const consulta = await secretaria!.get(`/api/horarios-asignaturas?planificacionSemestreId=${id}`);
    expect(consulta.status).toBe(200); expect(consulta.body.data).toHaveLength(6);
    const final = await secretaria!.get(`/api/horarios-asignaturas/excel/salas?planificacionSemestreId=${id}`).buffer(true).parse(binario);
    expect(final.status, JSON.stringify(final.body)).toBe(200);
    const finalLibro = new ExcelJS.Workbook(); await finalLibro.xlsx.load(final.body);
    expect(finalLibro.worksheets[0]!.rowCount).toBe(4);
    // La exportación de intercambio siempre vacía Sala N, no es un informe de salas asignadas.
    expect(finalLibro.worksheets[0]!.getCell(2, 9).text).toBe("");
    expect(await huella()).toBe(previa);
    console.info("Comprobado: publicación, bloqueo posterior, consulta docente/secretaría y exportación. Julia real PENDIENTE.");
  }, 60000);
});
