import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import request from "supertest";
import { exigirBasePruebas } from "../soporte/base-pruebas.js";

const habilitado = process.env.BASE_PRUEBAS_REINICIABLE !== undefined;
// Reject unsafe raw configuration before importing application config or connecting.
if (habilitado) exigirBasePruebas(process.env);

describe.skipIf(!habilitado)("Disponibilidad de autoservicio en PostgreSQL aislado", () => {
  let cliente: ReturnType<typeof postgres>;
  let aplicacion: typeof import("../../src/app.js").app;
  let cerrarAplicacion: (() => Promise<void>) | undefined;
  let cerrado = false;
  const tokens: Record<string, string> = {};
  const ruta = "/api/disponibilidad-profesores";
  const suficientes = [1, 2, 3, 4, 5, 6, 7];
  const carga = [
    { ofertaId: 1, asignaturaCodigo: "A", asignaturaNombre: "Asignatura A", seccion: 1, tipoHoraId: 2, tipoHoraNombre: "Práctica", horas: 2 },
    { ofertaId: 2, asignaturaCodigo: "A", asignaturaNombre: "Asignatura A", seccion: 2, tipoHoraId: 2, tipoHoraNombre: "Práctica", horas: 2 },
    { ofertaId: 3, asignaturaCodigo: "B", asignaturaNombre: "Asignatura B", seccion: 1, tipoHoraId: 1, tipoHoraNombre: "Teórica", horas: 3 },
  ];

  async function cerrar() {
    if (cerrado) return;
    cerrado = true;
    try { await cerrarAplicacion?.(); }
    finally { await cliente?.end(); }
  }

  beforeAll(async () => {
    try {
      cliente = postgres(process.env.DATABASE_URL!, { max: 1, onnotice: () => {} });
      const [destino] = await cliente`
        select current_database() as base, current_user as usuario,
          pg_get_userbyid(datdba) as propietario, shobj_description(oid, 'pg_database') as marca,
          pg_try_advisory_lock(18874001, 1) as bloqueo
        from pg_database where datname = current_database()`;
      expect(destino).toEqual({ base: "horarios_test", usuario: "pruebas_horarios", propietario: "pruebas_horarios",
        marca: "PT-OptimizacionHorarios resettable test database", bloqueo: true });
      await migrate(drizzle(cliente), { migrationsFolder: fileURLToPath(new URL("../../src/db/migrations", import.meta.url)) });
      const { queryClient } = await import("../../src/config/db.js");
      cerrarAplicacion = () => queryClient.end();
      ({ app: aplicacion } = await import("../../src/app.js"));
      const { generateToken } = await import("../../src/utils/jwt.js");
      const identidades = [
        { nombre: "profesor", id: 2, rol: "profesor" }, { nombre: "otro", id: 3, rol: "profesor" },
        { nombre: "admin", id: 4, rol: "admin" }, { nombre: "secretaria", id: 1, rol: "secretaria" },
        { nombre: "sinPerfil", id: 5, rol: "profesor" },
      ] as const;
      for (const identidad of identidades) {
        tokens[identidad.nombre] = generateToken({ ...identidad, correo: `${identidad.nombre}@example.test` });
      }
    } catch (error) {
      try { throw error; } finally { await cerrar(); }
    }
  }, 30000);
  afterAll(cerrar);

  beforeEach(async () => {
    // The verified identity, managed marker and exclusive lock precede every reset.
    await cliente`truncate carreras, departamentos, usuarios, bloques_horarios, tipos_hora restart identity cascade`;
    await cliente.begin(async transaccion => {
      await transaccion`insert into carreras(id,nombre) values (1,'Carrera propia'),(2,'Carrera externa'),(3,'Sin asignación')`;
      await transaccion`insert into departamentos(id,nombre) values (1,'Departamento propio'),(2,'Departamento externo')`;
      await transaccion`insert into carrera_departamento(carrera_id,departamento_id,es_gestionado) values (1,1,true),(2,2,true),(3,2,true)`;
      await transaccion`insert into usuarios(id,nombre,correo,clave,rol) values
        (1,'Secretaria','secretaria@example.test','sin-login','secretaria'),(2,'Profesor','profesor@example.test','sin-login','profesor'),
        (3,'Otro','otro@example.test','sin-login','profesor'),(4,'Admin','admin@example.test','sin-login','admin'),
        (5,'Sin perfil','sin-perfil@example.test','sin-login','profesor')`;
      await transaccion`insert into secretarias(usuario_id,carrera_id) values (1,1)`;
      await transaccion`insert into profesores(id,usuario_id,departamento_id,rut,nombre,tipo) values
        (1,2,1,'12345678-5','Profesor','planta'),(2,3,2,'11111111-1','Otro','planta')`;
      await transaccion`insert into planificaciones_semestres(id,carrera_id,codigo,actual,estado_planificacion) values
        (1,1,'2099-2',true,'preparacion'),(2,2,'2099-2',true,'preparacion'),
        (3,2,'2099-1',false,'preparacion'),(4,3,'2099-2',true,'preparacion')`;
      await transaccion`insert into asignaturas(codigo,nombre,departamento_id,semestre_malla) values ('A','Asignatura A',2,2),('B','Asignatura B',2,2)`;
      await transaccion`insert into carrera_asignatura(carrera_id,asignatura_codigo) values (1,'A'),(2,'A'),(2,'B'),(3,'A')`;
      await transaccion`insert into tipos_hora(id,tipo) values (1,'Teórica'),(2,'Práctica')`;
      await transaccion`insert into asignatura_tipo_hora(asignatura_codigo,tipo_hora_id,horas) values ('A',1,5),('A',2,2),('B',1,3)`;
      for (let numero = 1; numero <= 9; numero++) {
        const hora = String(numero + 7).padStart(2, "0");
        await transaccion`insert into bloques_horarios(id,dia,numero_bloque,hora_inicio,hora_termino)
          values (${numero},'Lunes',${numero},${`${hora}:00`},${`${hora}:50`})`;
      }
      await transaccion`insert into ofertas_asignaturas(id,asignatura_codigo,planificacion_semestre_id,seccion,cupos) values
        (1,'A',2,1,20),(2,'A',2,2,20),(3,'B',2,1,20),(4,'A',1,1,20),(5,'A',3,1,20),(6,'A',4,1,20)`;
      await transaccion`insert into oferta_tipo_hora(oferta_id,tipo_hora_id,profesor_id) values
        (1,2,1),(2,2,1),(3,1,1),(1,1,2),(4,1,1),(5,1,1),(6,1,2)`;
    });
  });

  function consultar(metodo: "get" | "post" | "delete", camino: string, cuerpo?: unknown, identidad = "profesor") {
    const peticion = request(aplicacion)[metodo](ruta + camino);
    if (identidad !== "anonimo") peticion.set("Authorization", `Bearer ${tokens[identidad]}`);
    return cuerpo === undefined ? peticion : peticion.send(cuerpo);
  }

  async function huella() {
    const tablas = await cliente`select tablename from pg_tables where schemaname='public' order by tablename`;
    const contenido: Record<string, string[]> = {};
    for (const { tablename: tabla } of tablas) {
      contenido[tabla] = (await cliente`select to_jsonb(fila) as dato from ${cliente(tabla)} fila`)
        .map(fila => JSON.stringify(fila.dato)).sort();
    }
    // PostgreSQL sequences are deliberately excluded: nextval is not transactional.
    return createHash("sha256").update(JSON.stringify(contenido)).digest("hex");
  }

  async function rechazar(metodo: "get" | "post" | "delete", camino: string, cuerpo: unknown,
    codigo: number, mensaje?: string, identidad = "profesor") {
    const antes = await huella();
    const respuesta = await consultar(metodo, camino, cuerpo, identidad);
    expect(respuesta.status, JSON.stringify(respuesta.body)).toBe(codigo);
    expect(respuesta.body.status).toBe("error");
    if (mensaje) expect(respuesta.body.message).toBe(mensaje);
    expect(await huella()).toBe(antes);
  }

  async function guardar(bloquesIds = suficientes) {
    const respuesta = await consultar("post", "/mi-disponibilidad", { planificacionSemestreId: 2, bloquesIds });
    expect(respuesta.status, JSON.stringify(respuesta.body)).toBe(200);
    return respuesta;
  }

  it("S2 S3 S4: suma 2+2+3 por sección y tipo, permite carrera externa y empieza vacío", async () => {
    const listado = await consultar("get", "/mi-disponibilidad");
    expect(listado.status).toBe(200);
    expect(listado.body.data.planificaciones).toEqual([
      { id: 1, codigo: "2099-2", carreraNombre: "Carrera propia", actual: true, estadoPlanificacion: "preparacion" },
      { id: 2, codigo: "2099-2", carreraNombre: "Carrera externa", actual: true, estadoPlanificacion: "preparacion" },
    ]);
    expect(listado.body.data.seleccion).toBeNull();
    expect(listado.body.data.bloques).toHaveLength(9);
    const seleccion = await consultar("get", "/mi-disponibilidad?planificacionSemestreId=2");
    expect(seleccion.status).toBe(200);
    expect(seleccion.body).toEqual({ status: "success", data: { ...listado.body.data,
      seleccion: { planificacionSemestreId: 2, bloquesIds: [], minimoBloques: 7, carga, editable: true } } });
  });

  it.each([
    { identidad: "anonimo", codigo: 401, mensaje: "No autorizado: Token de autenticación no proporcionado" },
    { identidad: "admin", codigo: 403 }, { identidad: "secretaria", codigo: 403 },
    { identidad: "sinPerfil", codigo: 403, mensaje: "No existe un perfil de profesor asociado" },
  ])("S3: rechaza identidad $identidad sin mutación", async caso => {
    await rechazar("get", "/mi-disponibilidad", undefined, caso.codigo, caso.mensaje, caso.identidad);
    await rechazar("post", "/mi-disponibilidad", { planificacionSemestreId: 2, bloquesIds: suficientes }, caso.codigo, caso.mensaje, caso.identidad);
  });

  it("S3: asignaciones y usuario autenticado, nunca el profesor solicitado, autorizan acceso", async () => {
    await rechazar("get", "/mi-disponibilidad?planificacionSemestreId=4", undefined, 403);
    await rechazar("post", "/mi-disponibilidad", { planificacionSemestreId: 4, bloquesIds: suficientes }, 403);
    await rechazar("post", "/mi-disponibilidad", { profesorId: 2, planificacionSemestreId: 2, bloquesIds: suficientes }, 400);
    await rechazar("post", "/sincronizar", { profesorId: 2, planificacionSemestreId: 2, bloquesIds: suficientes }, 403, "Solo puede gestionar su propia disponibilidad");
    await rechazar("get", "/?profesorId=2", undefined, 403, "Solo puede consultar su propia disponibilidad");
  });

  it.each([
    { bloquesIds: [], mensaje: "Debe seleccionar al menos un bloque de disponibilidad" },
    { bloquesIds: [1,2,3,4,5,6,6], mensaje: "Debe seleccionar al menos 7 bloques de disponibilidad" },
    { bloquesIds: [1,2,3,4,5,6], mensaje: "Debe seleccionar al menos 7 bloques de disponibilidad" },
    { bloquesIds: [1,2,3,4,5,6,99], mensaje: "Hay bloques horarios inexistentes" },
    { bloquesIds: ["1"] },
  ])("S5: rechaza $bloquesIds preservando envío anterior", async caso => {
    await guardar();
    await rechazar("post", "/mi-disponibilidad", { planificacionSemestreId: 2, bloquesIds: caso.bloquesIds }, 400, caso.mensaje);
  });

  it("S5 S8: deduplica y reemplaza solo la selección propia sin transicionar planificación", async () => {
    await cliente`insert into disponibilidad_profesores(profesor_id,planificacion_semestre_id,bloque_id) values (2,4,9),(1,1,9)`;
    const otras = await cliente`select * from disponibilidad_profesores order by id`;
    const planificaciones = await cliente`select * from planificaciones_semestres order by id`;
    const respuesta = await guardar([7,6,5,4,3,2,1,1]);
    expect(respuesta.body).toEqual({ status: "success", data: { planificacionSemestreId: 2, bloquesIds: suficientes, minimoBloques: 7, carga, editable: true } });
    const propias = await cliente`select profesor_id,planificacion_semestre_id,bloque_id from disponibilidad_profesores where planificacion_semestre_id=2 order by bloque_id`;
    expect(propias).toEqual(suficientes.map(bloque => ({ profesor_id: 1, planificacion_semestre_id: 2, bloque_id: bloque })));
    expect(await cliente`select * from disponibilidad_profesores where planificacion_semestre_id<>2 order by id`).toEqual(otras);
    expect(await cliente`select * from planificaciones_semestres order by id`).toEqual(planificaciones);
    const lectura = await consultar("get", "/mi-disponibilidad?planificacionSemestreId=2");
    expect(lectura.body.data.seleccion).toEqual(respuesta.body.data);
  });

  it.each(["propuesta", "publicado"])("S6: %s permite lectura pero no edición", async estado => {
    await guardar();
    await cliente`update planificaciones_semestres set estado_planificacion=${estado} where id=2`;
    const lectura = await consultar("get", "/mi-disponibilidad?planificacionSemestreId=2");
    expect(lectura.status).toBe(200);
    expect(lectura.body.data.seleccion.editable).toBe(false);
    await rechazar("post", "/mi-disponibilidad", { planificacionSemestreId: 2, bloquesIds: suficientes }, 403,
      "Solo se puede modificar disponibilidad en una planificación actual en preparación");
  });

  it("S6: excluye periodo histórico del selector y rechaza sus escrituras", async () => {
    await rechazar("get", "/mi-disponibilidad?planificacionSemestreId=3", undefined, 403);
    await rechazar("post", "/mi-disponibilidad", { planificacionSemestreId: 3, bloquesIds: suficientes }, 403);
    await rechazar("post", "/sincronizar", { profesorId: 1, planificacionSemestreId: 3, bloquesIds: suficientes }, 403);
  });

  it.each(["carga cero", "asignación retirada"])("S3 S5: falla cerrado con %s", async caso => {
    await guardar();
    if (caso === "carga cero") await cliente`update asignatura_tipo_hora set horas=0`;
    else await cliente`delete from oferta_tipo_hora where profesor_id=1 and oferta_id in (1,2,3)`;
    await rechazar("post", "/mi-disponibilidad", { planificacionSemestreId: 2, bloquesIds: suficientes }, 403,
      caso === "carga cero" ? "No tiene carga docente positiva en esta planificación" : "No tiene asignaciones en esta planificación actual");
  });

  it("S5: las rutas antiguas no eluden mínimo, identidad ni unicidad", async () => {
    await guardar();
    await rechazar("post", "/sincronizar", { profesorId: 1, planificacionSemestreId: 2, bloquesIds: [1] }, 400, "Debe seleccionar al menos 7 bloques de disponibilidad");
    await rechazar("post", "/", { profesorId: 1, planificacionSemestreId: 2, bloqueId: 1 }, 409, "El profesor ya tiene disponibilidad en ese bloque y planificación");
    await rechazar("post", "/", { profesorId: 1, planificacionSemestreId: 1, bloqueId: 1 }, 400, "Debe seleccionar al menos 5 bloques de disponibilidad");
    const [fila] = await cliente`select id from disponibilidad_profesores order by id limit 1`;
    await rechazar("delete", `/${fila.id}`, undefined, 400, "Debe seleccionar al menos 7 bloques de disponibilidad");
    await rechazar("delete", "/profesor/1/planificacion-semestre/2", undefined, 400, "Debe seleccionar al menos un bloque de disponibilidad");
    const agregada = await consultar("post", "/", { profesorId: 1, planificacionSemestreId: 2, bloqueId: 8 });
    expect(agregada.status).toBe(201);
    expect(agregada.body.data.bloqueId).toBe(8);
    expect(agregada.body.data.profesor.id).toBe(1);
    expect(agregada.body.data.profesor).not.toHaveProperty("rut");
  });

  it("S5: un fallo tardío de inserción revierte el reemplazo completo", async () => {
    await guardar();
    try {
      await cliente`create function disponibilidad_prueba_fallo() returns trigger language plpgsql as $$
        begin if new.bloque_id=9 then raise exception 'isolated availability failure'; end if; return new; end $$`;
      await cliente`create trigger disponibilidad_prueba_fallo before insert on disponibilidad_profesores
        for each row execute function disponibilidad_prueba_fallo()`;
      await rechazar("post", "/mi-disponibilidad", { planificacionSemestreId: 2, bloquesIds: [1,2,3,4,5,6,9] }, 500, "Internal server error");
    } finally {
      try { await cliente`drop trigger if exists disponibilidad_prueba_fallo on disponibilidad_profesores`; }
      finally { await cliente`drop function if exists disponibilidad_prueba_fallo()`; }
    }
  });
});
