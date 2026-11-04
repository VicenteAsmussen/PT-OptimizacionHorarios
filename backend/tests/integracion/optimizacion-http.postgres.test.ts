import { beforeAll, afterAll, describe, it, expect, vi } from "vitest";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import express, { type Express } from "express";
import request, { type Test } from "supertest";
import { exigirBasePruebas } from "../soporte/base-pruebas.js";
import type { EntradaOptimizacion, SalidaOptimizacion } from "../../src/optimizacion/contrato.js";

const control = vi.hoisted(() => ({ entrada: undefined as EntradaOptimizacion | undefined,
  resolver: undefined as ((salida: SalidaOptimizacion) => void) | undefined }));
// Solo se sustituye el proceso hijo. HTTP, permisos, servicios y PostgreSQL son reales.
vi.mock("../../src/optimizacion/proceso.js", () => ({
  ejecutarJulia: (entrada: EntradaOptimizacion) => {
    control.entrada = entrada;
    return new Promise<SalidaOptimizacion>(resolver => { control.resolver = resolver; });
  }, cerrarProcesosJulia: () => {},
}));

const habilitado = process.env.BASE_PRUEBAS_REINICIABLE !== undefined;
if (habilitado) exigirBasePruebas(process.env);
describe.skipIf(!habilitado)("Optimización HTTP en PostgreSQL aislado", () => {
  let cliente: ReturnType<typeof postgres>, app: Express, token: string, cerrar: () => Promise<void>;
  async function exigirAislamiento() {
    exigirBasePruebas(process.env);
    const [identidad] = await cliente`select current_database() as base,current_user as usuario,pg_try_advisory_lock(18874001,1) as bloqueo`;
    if (identidad?.base !== "horarios_test" || identidad?.usuario !== "pruebas_horarios" || !identidad.bloqueo) {
      throw new Error("No se comprobó la base aislada ni el bloqueo exclusivo. No se escribirá.");
    }
  }
  beforeAll(async () => {
    cliente = postgres(process.env.DATABASE_URL!, { max: 1, onnotice: () => {} });
    await exigirAislamiento();
    await migrate(drizzle(cliente), { migrationsFolder: fileURLToPath(new URL("../../src/db/migrations", import.meta.url)) });
    const { optimizacionRouter } = await import("../../src/routes/optimizacion.routes.js");
    const { administracionPeriodosRouter } = await import("../../src/routes/administracion-periodos.routes.js");
    const { resultadosHorariosRouter } = await import("../../src/routes/resultados-horarios.routes.js");
    const { errorHandler } = await import("../../src/middlewares/error.middleware.js");
    const { generateToken } = await import("../../src/utils/jwt.js");
    const { queryClient } = await import("../../src/config/db.js");
    cerrar = () => queryClient.end();
    token = generateToken({ id: 1, nombre: "Administrador sintético", correo: "admin@example.test", rol: "admin" });
    app = express(); app.use(express.json());
    app.use("/modelo", optimizacionRouter); app.use("/admin", administracionPeriodosRouter);
    app.use("/resultado", resultadosHorariosRouter); app.use(errorHandler);
  }, 30000);
  afterAll(async () => { try { await cerrar?.(); } finally { await cliente?.end(); } });
  async function prepararDatosAislados() {
    await exigirAislamiento();
    await cliente`truncate carreras,departamentos,usuarios,bloques_horarios,tipos_hora,salas restart identity cascade`;
    await cliente.begin(async conexion => {
      await conexion`insert into carreras(id,nombre) values(1,'Ingeniería Civil en Informática')`;
      await conexion`insert into departamentos(id,nombre) values(1,'Gestionado'),(2,'Externo')`;
      await conexion`insert into carrera_departamento(carrera_id,departamento_id,es_gestionado) values(1,1,true),(1,2,false)`;
      await conexion`insert into asignaturas(codigo,nombre,departamento_id,semestre_malla) values('INT','Interna',1,2),('EXT','Externa',2,2)`;
      await conexion`insert into carrera_asignatura(carrera_id,asignatura_codigo) values(1,'INT'),(1,'EXT')`;
      await conexion`insert into profesores(id,departamento_id,rut,nombre,tipo) values(1,1,'12345678-5','Docente uno','planta'),(2,2,'11111111-1','Docente externo','planta'),(3,1,'22222222-2','Docente dos','planta')`;
      await conexion`insert into planificaciones_semestres(id,carrera_id,codigo,actual,estado_planificacion) values(1,1,'2099-2',true,'preparacion'),(2,1,'2098-2',false,'publicado')`;
      await conexion`insert into tipos_hora(id,tipo) values(1,'Teórica')`;
      await conexion`insert into asignatura_tipo_hora(asignatura_codigo,tipo_hora_id,horas) values('INT',1,2),('EXT',1,2)`;
      const dias = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes"];
      const hora = (numero: number) => `${String(8 + Math.floor(numero * 40 / 60)).padStart(2, "0")}:${String(numero * 40 % 60).padStart(2, "0")}`;
      for (let dia = 0; dia < 5; dia++) for (let bloque = 1; bloque <= 16; bloque++) {
        await conexion`insert into bloques_horarios(id,dia,numero_bloque,hora_inicio,hora_termino) values(${dia * 16 + bloque},${dias[dia]!},${bloque},${hora(bloque - 1)},${hora(bloque)})`;
      }
      await conexion`insert into salas(id,nombre,capacidad,tipo) values(1,'A101AA',90,'Sala')`;
      await conexion`insert into ofertas_asignaturas(id,asignatura_codigo,planificacion_semestre_id,seccion,cupos) values(1,'INT',1,1,30),(2,'EXT',1,1,30),(3,'INT',2,1,30),(4,'INT',1,2,30)`;
      await conexion`insert into oferta_tipo_hora(oferta_id,tipo_hora_id,profesor_id) values(1,1,1),(2,1,2),(3,1,1),(4,1,3)`;
      await conexion`insert into horarios_asignaturas(oferta_id,tipo_hora_id,planificacion_semestre_id,bloque_id) values(2,1,1,3),(2,1,1,4),(3,1,2,1),(3,1,2,2)`;
      await conexion`insert into disponibilidad_profesores(profesor_id,planificacion_semestre_id,bloque_id) select p,1,b from unnest(array[1,3]) p cross join unnest(array[1,2,5,6]) b`;
    });
  }
  const autorizar = (solicitud: Test) => solicitud.set("Authorization", `Bearer ${token}`);
  const parametros = { claveIdempotencia: "solicitud-regresion-http", recursos: [{ id: "AA-Sala-90", edificio: "AA", tipo: "Sala", capacidad: 90, cantidad: 1, fuente: "Datos sintéticos aislados" }] };
  async function huellaHorarios() {
    return createHash("sha256").update(JSON.stringify(await cliente`select * from horarios_asignaturas order by id`)).digest("hex");
  }
  function salida(completa: boolean): SalidaOptimizacion {
    const entrada = control.entrada!;
    return { version: 1, revision: entrada.revision, estado: completa ? "limite_tiempo" : "optimo", objetivo: completa ? 0 : 4000,
      asignaciones: completa ? [1, 2, 5, 6].map((bloqueId, indice) => ({ ofertaId: indice < 2 ? 1 : 4, tipoHoraId: 1, bloqueId, categoriaId: "AA-Sala-90" })) : [],
      faltantes: [1, 4].map(ofertaId => ({ ofertaId, tipoHoraId: 1, horas: completa ? 0 : 2 })),
      protecciones: entrada.parejas.flatMap(pareja => pareja.seccionesA.flatMap(ofertaAId => pareja.seccionesB.map(ofertaBId => ({ parejaId: pareja.id, ofertaAId, ofertaBId, protegida: true })))) };
  }
  async function esperarEstado(id: string, esperado: string) {
    await vi.waitFor(async () => {
      const respuesta = await autorizar(request(app).get(`/modelo/ejecuciones/${id}`));
      expect(respuesta.status).toBe(200); expect(respuesta.body.data.estado).toBe(esperado);
    }, { timeout: 15000, interval: 100 });
  }
  it("aplica timeout completo, conserva recursos y rechaza incompletos sin cambios parciales", async () => {
    await prepararDatosAislados();
    let anterior = await huellaHorarios();
    let inicio = await autorizar(request(app).post("/modelo/planificaciones/1/ejecuciones")).send(parametros);
    expect(inicio.status).toBe(202);
    let id = inicio.body.data.id;
    expect((await autorizar(request(app).get(`/modelo/ejecuciones/${id}`))).body.data.estado).toBe("en_ejecucion");
    expect((await autorizar(request(app).get("/modelo/planificaciones/1/ultima-ejecucion"))).body.data.id).toBe(id);
    expect((await autorizar(request(app).patch("/admin/1/estado")).send({ estadoAnterior: "preparacion", estadoPlanificacion: "propuesta" })).status).toBe(409);
    expect((await autorizar(request(app).post("/admin/1/reiniciar")).send({ objetivo: "horarios", alcance: "gestionadas", confirmacion: "2099-2", huella: "0".repeat(64) })).status).toBe(409);
    expect(await huellaHorarios()).toBe(anterior);
    control.resolver!(salida(true)); await esperarEstado(id, "aplicada");
    expect((await cliente`select estado_planificacion as estado from planificaciones_semestres where id=1`)[0]!.estado).toBe("propuesta");
    const trazabilidad = await cliente`select id,categoria_optimizacion_id,ejecucion_optimizacion_id from horarios_asignaturas where planificacion_semestre_id=1 and oferta_id in (1,4) order by id`;
    expect(trazabilidad).toHaveLength(4);
    expect(trazabilidad.every(fila => fila.categoria_optimizacion_id === "AA-Sala-90" && fila.ejecucion_optimizacion_id === id)).toBe(true);
    anterior = await huellaHorarios();
    const vista = await autorizar(request(app).get("/resultado/1")); expect(vista.status).toBe(200);
    const sesion = vista.body.data.sesiones.find((fila: { ofertaId: number }) => fila.ofertaId === 4);
    const movimiento = await autorizar(request(app).post("/resultado/1/movimientos")).send({ revision: vista.body.data.revision, idsHorarios: sesion.idsHorarios, bloqueInicioId: 1 });
    expect(movimiento.status).toBe(409);
    expect(movimiento.body.message).toContain("El movimiento excede la cantidad de la categoría de la ejecución.");
    expect(await cliente`select id,categoria_optimizacion_id,ejecucion_optimizacion_id from horarios_asignaturas where planificacion_semestre_id=1 and oferta_id in (1,4) order by id`).toEqual(trazabilidad);
    expect(await huellaHorarios()).toBe(anterior);
    const publicacion = await autorizar(request(app).post("/resultado/1/publicar")).send({ revision: vista.body.data.revision });
    expect(publicacion.status).toBe(409); expect(publicacion.body.message).toContain("requiere sala sin asignación");
    expect(await huellaHorarios()).toBe(anterior);
    await prepararDatosAislados(); anterior = await huellaHorarios();
    inicio = await autorizar(request(app).post("/modelo/planificaciones/1/ejecuciones")).send(parametros);
    expect(inicio.status).toBe(202); id = inicio.body.data.id;
    control.resolver!(salida(false)); await esperarEstado(id, "carga_incompleta");
    expect((await cliente`select estado_planificacion as estado from planificaciones_semestres where id=1`)[0]!.estado).toBe("preparacion");
    expect(await huellaHorarios()).toBe(anterior);
  }, 60000);
});
