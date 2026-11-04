import { beforeAll, beforeEach, afterAll, describe, expect, it } from "vitest";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { exigirBasePruebas } from "../soporte/base-pruebas.js";

const habilitado = process.env.BASE_PRUEBAS_REINICIABLE !== undefined;
if (habilitado) exigirBasePruebas(process.env);
describe.skipIf(!habilitado)("Ejecuciones en PostgreSQL aislado", () => {
  let cliente: ReturnType<typeof postgres>;
  let cerrar: () => Promise<void>;
  let repositorio: typeof import("../../src/repositories/optimizacion.repository.js").optimizacionRepository;
  let ofertas: typeof import("../../src/repositories/ofertas.repository.js").ofertasRepository;
  let administracion: typeof import("../../src/repositories/administracion-periodos.repository.js").administracionPeriodosRepository;
  const propietario = randomUUID();
  const parametros = (clave = "peticion-aislada-1") => ({ claveIdempotencia: clave, recursos: [{ id: "AA-Sala-90", edificio: "AA", tipo: "Sala" as const, capacidad: 90, cantidad: 1, fuente: "Inventario sintético aislado" }] });
  beforeAll(async () => {
    cliente = postgres(process.env.DATABASE_URL!, { max: 1, onnotice: () => {} });
    const [identidad] = await cliente`select current_database() as base,current_user as usuario,pg_try_advisory_lock(18874001,1) as bloqueo`;
    if (identidad?.base !== "horarios_test" || identidad?.usuario !== "pruebas_horarios" || !identidad?.bloqueo) throw new Error("No se comprobó una base aislada y exclusiva, no se escribirá.");
    await migrate(drizzle(cliente), { migrationsFolder: fileURLToPath(new URL("../../src/db/migrations", import.meta.url)) });
    ({ optimizacionRepository: repositorio } = await import("../../src/repositories/optimizacion.repository.js"));
    ({ ofertasRepository: ofertas } = await import("../../src/repositories/ofertas.repository.js"));
    ({ administracionPeriodosRepository: administracion } = await import("../../src/repositories/administracion-periodos.repository.js"));
    const { queryClient } = await import("../../src/config/db.js"); cerrar = () => queryClient.end();
  }, 30000);
  afterAll(async () => { try { await cerrar?.(); } finally { await cliente?.end(); } });
  beforeEach(async () => {
    await cliente`truncate carreras,departamentos,usuarios,bloques_horarios,tipos_hora,salas restart identity cascade`;
    await cliente.begin(async conexion => {
      await conexion`insert into carreras(id,nombre) values(1,'Ingeniería Civil en Informática')`;
      await conexion`insert into departamentos(id,nombre) values(1,'Gestionado'),(2,'Externo')`;
      await conexion`insert into carrera_departamento(carrera_id,departamento_id,es_gestionado) values(1,1,true),(1,2,false)`;
      await conexion`insert into asignaturas(codigo,nombre,departamento_id,semestre_malla) values('INT','Interna',1,2),('EXT','Externa',2,2)`;
      await conexion`insert into carrera_asignatura(carrera_id,asignatura_codigo) values(1,'INT'),(1,'EXT')`;
      await conexion`insert into profesores(id,departamento_id,rut,nombre,tipo) values(1,1,'12345678-5','Docente aislado','planta'),(2,2,'11111111-1','Externo aislado','planta')`;
      await conexion`insert into planificaciones_semestres(id,carrera_id,codigo,actual,estado_planificacion) values(1,1,'2099-2',true,'preparacion'),(2,1,'2098-2',false,'publicado')`;
      await conexion`insert into tipos_hora(id,tipo) values(1,'Teórica')`;
      await conexion`insert into asignatura_tipo_hora(asignatura_codigo,tipo_hora_id,horas) values('INT',1,2),('EXT',1,2)`;
      await conexion`insert into bloques_horarios(id,dia,numero_bloque,hora_inicio,hora_termino) values(1,'Lunes',1,'08:10','08:50'),(2,'Lunes',2,'08:50','09:30'),(3,'Martes',1,'08:10','08:50'),(4,'Martes',2,'08:50','09:30')`;
      await conexion`insert into salas(id,nombre,capacidad,tipo) values(1,'A101AA',90,'Sala')`;
      await conexion`insert into ofertas_asignaturas(id,asignatura_codigo,planificacion_semestre_id,seccion,cupos) values(1,'INT',1,1,30),(2,'EXT',1,1,30),(3,'INT',2,1,30)`;
      await conexion`insert into oferta_tipo_hora(oferta_id,tipo_hora_id,profesor_id) values(1,1,1),(2,1,2),(3,1,1)`;
      await conexion`insert into horarios_asignaturas(oferta_id,tipo_hora_id,planificacion_semestre_id,bloque_id) values(2,1,1,3),(2,1,1,4),(3,1,2,1),(3,1,2,2)`;
      await conexion`insert into disponibilidad_profesores(profesor_id,planificacion_semestre_id,bloque_id) values(1,1,1),(1,1,2)`;
    });
  });
  const iniciar = (clave?: string) => repositorio.iniciar(1, parametros(clave), propietario, "prueba-aislada", captura => ({ revision: captura.revision }));
  async function estadoProtegido() {
    return { horarios: await cliente`select * from horarios_asignaturas order by id`, periodos: await cliente`select * from planificaciones_semestres order by id` };
  }
  it("serializa doble petición y conserva una sola ejecución por clave", async () => {
    const respuestas = await Promise.all([iniciar(), iniciar()]);
    expect(respuestas[0].ejecucion.id).toBe(respuestas[1].ejecucion.id);
    expect(respuestas.filter(respuesta => respuesta.nueva)).toHaveLength(1);
    expect(await cliente`select id from ejecuciones_optimizacion`).toHaveLength(1);
    await expect(iniciar("peticion-distinta")).rejects.toMatchObject({ statusCode: 409 });
  });
  it("bloquea ediciones durante cálculo sin modificar horarios ni publicados", async () => {
    const anterior = await estadoProtegido();
    await iniciar();
    await expect(ofertas.update(1, { cupos: 40 })).rejects.toMatchObject({ statusCode: 409 });
    await expect(administracion.cambiarEstado(1, { estadoAnterior: "preparacion", estadoPlanificacion: "propuesta" })).rejects.toMatchObject({ statusCode: 409 });
    await expect(administracion.reiniciar(1, { objetivo: "horarios", alcance: "gestionadas", confirmacion: "2099-2", huella: "sin-confirmar" })).rejects.toMatchObject({ statusCode: 409 });
    expect(await estadoProtegido()).toEqual(anterior);
  });
  it("detecta cambios de catálogo y no aplica ni un bloque", async () => {
    const anterior = await estadoProtegido();
    const { ejecucion } = await iniciar();
    await cliente`update salas set capacidad=80 where id=1`;
    expect(await repositorio.aplicar(ejecucion.id, propietario, {}, () => [{ ofertaId: 1, tipoHoraId: 1, bloqueId: 1 }])).toBe(false);
    expect((await repositorio.consultar(ejecucion.id)).estado).toBe("datos_desactualizados");
    expect(await estadoProtegido()).toEqual(anterior);
  });
  it("recupera interrupción y rechaza el resultado tardío sin reejecutar", async () => {
    const anterior = await estadoProtegido();
    const { ejecucion } = await iniciar();
    await cliente`update ejecuciones_optimizacion set vigente_hasta=now()-interval '1 second' where id=${ejecucion.id}`;
    await repositorio.recuperar();
    expect((await repositorio.consultar(ejecucion.id)).estado).toBe("interrumpida");
    expect(await repositorio.aplicar(ejecucion.id, propietario, {}, () => [{ ofertaId: 1, tipoHoraId: 1, bloqueId: 1 }])).toBe(false);
    await ofertas.update(1, { cupos: 31 });
    expect(await estadoProtegido()).toEqual(anterior);
    expect(await cliente`select id from ejecuciones_optimizacion`).toHaveLength(1);
  });
  it("incorpora solución completa y Propuesta sin alterar externos ni publicados", async () => {
    const anteriores = await cliente`select * from horarios_asignaturas order by id`;
    const { ejecucion } = await iniciar();
    const asignaciones = [1, 2].map(bloqueId => ({ ofertaId: 1, tipoHoraId: 1, bloqueId, categoriaId: "AA-Sala-90" }));
    expect(await repositorio.aplicar(ejecucion.id, propietario, { completa: true, asignaciones }, () => asignaciones.map(({ categoriaId, ...horario }) => ({ ...horario, categoriaOptimizacionId: categoriaId })))).toBe(true);
    expect((await repositorio.consultar(ejecucion.id)).estado).toBe("aplicada");
    expect(await cliente`select * from horarios_asignaturas where oferta_id<>1 order by id`).toEqual(anteriores);
    expect((await cliente`select estado_planificacion as estado from planificaciones_semestres where id=1`)[0]?.estado).toBe("propuesta");
    expect((await cliente`select estado_planificacion as estado from planificaciones_semestres where id=2`)[0]?.estado).toBe("publicado");
    await expect(iniciar("no-reemplazar-horario")).rejects.toMatchObject({ statusCode: 409 });
  });
  it("un fallo de validación revierte la transacción completa", async () => {
    const anterior = await estadoProtegido();
    const { ejecucion } = await iniciar();
    await expect(repositorio.aplicar(ejecucion.id, propietario, {}, () => { throw new Error("Salida incompleta"); })).rejects.toThrow("Salida incompleta");
    await repositorio.terminar(ejecucion.id, propietario, "carga_incompleta", {}, { faltantes: [{ asignatura: "INT", seccion: 1, componente: "Teórica", bloques: 2 }] });
    expect(await estadoProtegido()).toEqual(anterior);
  });
});
