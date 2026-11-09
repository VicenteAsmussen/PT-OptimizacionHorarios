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
  it("claves distintas simultáneas y recursos incompatibles conservan un único intento", async () => {
    const respuestas = await Promise.allSettled([iniciar("clave-paralela-uno"), iniciar("clave-paralela-dos")]);
    const aceptadas = respuestas.flatMap(respuesta => respuesta.status === "fulfilled" ? [respuesta.value] : []);
    const rechazadas = respuestas.flatMap(respuesta => respuesta.status === "rejected" ? [respuesta.reason] : []);
    expect(aceptadas).toHaveLength(1); expect(rechazadas).toHaveLength(1);
    expect(rechazadas[0]).toMatchObject({ statusCode: 409 });
    const guardadas = await cliente`select * from ejecuciones_optimizacion order by id`;
    expect(guardadas).toHaveLength(1);
    const solicitud = parametros(aceptadas[0]!.ejecucion.claveIdempotencia);
    solicitud.recursos[0]!.cantidad = 2;
    await expect(repositorio.iniciar(1, solicitud, propietario, "prueba-aislada", captura => ({ revision: captura.revision })))
      .rejects.toMatchObject({ statusCode: 409 });
    expect(await cliente`select * from ejecuciones_optimizacion order by id`).toEqual(guardadas);
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
  it("conserva el error hasta aceptar otro intento y solo retiene la ejecución actual del período", async () => {
    const anterior = await estadoProtegido();
    const { ejecucion: fallida } = await iniciar();
    const diagnostico = { codigo: "error", mensaje: "El modelo no pudo completar el cálculo." };
    await repositorio.terminar(fallida.id, propietario, "error", null, diagnostico);
    expect(await repositorio.ultima(1)).toMatchObject({ id: fallida.id, estado: "error", diagnostico });
    expect((await iniciar()).ejecucion.id).toBe(fallida.id);
    await expect(repositorio.iniciar(1, parametros("entrada-invalida"), propietario, "prueba-aislada", () => {
      throw new Error("Recursos inválidos");
    })).rejects.toThrow("Recursos inválidos");
    expect((await repositorio.ultima(1))?.id).toBe(fallida.id);
    const copia = randomUUID();
    await cliente`insert into ejecuciones_optimizacion select ${copia},2,clave_idempotencia,revision_solicitud,revision_entrada,version_modelo,propietario,estado,entrada,parametros,resultado,diagnostico,iniciada_en,finalizada_en,vigente_hasta from ejecuciones_optimizacion where id=${fallida.id}`;
    const respuestas = await Promise.all([iniciar("nuevo-intento"), iniciar("nuevo-intento")]);
    expect(respuestas[0].ejecucion.id).not.toBe(fallida.id);
    expect(respuestas[0].ejecucion.id).toBe(respuestas[1].ejecucion.id);
    expect(respuestas.filter(respuesta => respuesta.nueva)).toHaveLength(1);
    expect(await cliente`select id from ejecuciones_optimizacion where planificacion_semestre_id=1`).toHaveLength(1);
    expect((await repositorio.ultima(2))?.id).toBe(copia);
    await expect(repositorio.consultar(fallida.id)).rejects.toMatchObject({ statusCode: 404 });
    expect(await estadoProtegido()).toEqual(anterior);
  });
  it("el reinicio gestionado borra resultado e intentos anteriores, conserva externos y permite una nueva ejecución", async () => {
    const anteriores = await cliente`select * from horarios_asignaturas order by id`;
    const { ejecucion } = await iniciar();
    const asignaciones = [1, 2].map(bloqueId => ({ ofertaId: 1, tipoHoraId: 1, bloqueId, categoriaId: "AA-Sala-90" }));
    expect(await repositorio.aplicar(ejecucion.id, propietario, { completa: true, asignaciones }, () => asignaciones.map(({ categoriaId, ...horario }) => ({ ...horario, categoriaOptimizacionId: categoriaId })))).toBe(true);
    const antigua = randomUUID(); const otroPeriodo = randomUUID();
    for (const [id, periodo] of [[antigua, 1], [otroPeriodo, 2]] as const) {
      await cliente`insert into ejecuciones_optimizacion select ${id},${periodo},${id},revision_solicitud,revision_entrada,version_modelo,propietario,'error',entrada,parametros,null,diagnostico,iniciada_en,finalizada_en,vigente_hasta from ejecuciones_optimizacion where id=${ejecucion.id}`;
    }
    const resumen = await administracion.resumen(1, "gestionadas");
    await administracion.reiniciar(1, { objetivo: "horarios", alcance: "gestionadas", confirmacion: "2099-2", huella: resumen.huella });
    expect(await repositorio.ultima(1)).toBeNull();
    expect((await repositorio.ultima(2))?.id).toBe(otroPeriodo);
    expect(await cliente`select * from horarios_asignaturas order by id`).toEqual(anteriores);
    expect(await cliente`select * from ofertas_asignaturas`).toHaveLength(3);
    expect(await cliente`select * from oferta_tipo_hora`).toHaveLength(3);
    await administracion.cambiarEstado(1, { estadoAnterior: "propuesta", estadoPlanificacion: "preparacion" });
    const nueva = await iniciar("despues-del-reinicio");
    expect(nueva.ejecucion.id).not.toBe(ejecucion.id);
    expect(await cliente`select id from ejecuciones_optimizacion where planificacion_semestre_id=1`).toHaveLength(1);
  });
  it("el reinicio gestionado limpia el fallo sin horarios y el externo no elimina la ejecución", async () => {
    const { ejecucion } = await iniciar();
    await repositorio.terminar(ejecucion.id, propietario, "error", null, { mensaje: "Error de cálculo" });
    const externo = await administracion.resumen(1, "externas");
    await administracion.reiniciar(1, { objetivo: "horarios", alcance: "externas", confirmacion: "2099-2", huella: externo.huella });
    expect((await repositorio.ultima(1))?.id).toBe(ejecucion.id);
    const resumen = await administracion.resumen(1, "gestionadas");
    expect(resumen.horarios).toBe(0);
    await administracion.reiniciar(1, { objetivo: "horarios", alcance: "gestionadas", confirmacion: "2099-2", huella: resumen.huella });
    expect(await repositorio.ultima(1)).toBeNull();
  });
  it.each(["inicio", "reinicio"])("un fallo de escritura durante %s conserva íntegro el intento previo y sus horarios", async paso => {
    const { ejecucion } = await iniciar();
    if (paso === "inicio") {
      await repositorio.terminar(ejecucion.id, propietario, "error", null, { mensaje: "Error conservado" });
    } else {
      const asignaciones = [1, 2].map(bloqueId => ({ ofertaId: 1, tipoHoraId: 1, bloqueId, categoriaOptimizacionId: "AA-Sala-90" }));
      expect(await repositorio.aplicar(ejecucion.id, propietario, {}, () => asignaciones)).toBe(true);
    }
    const anterior = await estadoProtegido();
    const intentos = await cliente`select * from ejecuciones_optimizacion order by id`;
    const resumen = await administracion.resumen(1, "gestionadas");
    // El fallo se inyecta solo en esta base sintética, después de eliminar los datos previos.
    await cliente.unsafe("CREATE FUNCTION fallo_retencion_aislado() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Fallo aislado de escritura'; END $$");
    try {
      const evento = paso === "inicio" ? "INSERT" : "DELETE";
      await cliente.unsafe(`CREATE TRIGGER fallo_retencion_aislado BEFORE ${evento} ON ejecuciones_optimizacion FOR EACH ROW EXECUTE FUNCTION fallo_retencion_aislado()`);
      const operacion = paso === "inicio" ? iniciar("nuevo-intento-con-fallo")
        : administracion.reiniciar(1, { objetivo: "horarios", alcance: "gestionadas", confirmacion: "2099-2", huella: resumen.huella });
      await expect(operacion).rejects.toThrow();
      expect(await estadoProtegido()).toEqual(anterior);
      expect(await cliente`select * from ejecuciones_optimizacion order by id`).toEqual(intentos);
    } finally {
      await cliente.unsafe("DROP TRIGGER IF EXISTS fallo_retencion_aislado ON ejecuciones_optimizacion");
      await cliente.unsafe("DROP FUNCTION fallo_retencion_aislado()");
    }
  });
});
