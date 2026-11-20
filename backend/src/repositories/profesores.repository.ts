import type { AlcanceCarrera } from "../utils/alcance-carrera.js";
import { eq, and, inArray } from "drizzle-orm";
import { db } from "../config/db.js";
import { profesores, type Profesor, type NuevoProfesor } from "../db/schema/profesores.schema.js";
import { departamentos } from "../db/schema/departamentos.schema.js";
import { usuarios, type NuevoUsuario } from "../db/schema/usuarios.schema.js";
import { ofertasAsignaturas } from "../db/schema/ofertas-asignaturas.schema.js";
import { ofertaTipoHora } from "../db/schema/oferta-tipo-hora.schema.js";
import { disponibilidadProfesores } from "../db/schema/disponibilidad-profesores.schema.js";
import { horariosAsignaturas } from "../db/schema/horarios-asignaturas.schema.js";
import { planificacionesSemestresRepository } from "./planificaciones-semestres.repository.js";
import { conPlanificacionesBloqueadas, type TransaccionPlanificacion } from "./planificacion-escritura.js";
import { usuariosRepository } from "./usuarios.repository.js";
import { ForbiddenError } from "../utils/errors.js";
import { conCatalogosBloqueados, exigirCatalogoSinDependencias, tieneDependenciasProfesor } from "./dependencias-academicas.js";

// Localiza y ordena los períodos afectados por la disponibilidad y las asignaciones del docente.
async function periodosProfesor(tx: TransaccionPlanificacion, id: number) {
  const disponibilidades = await tx.query.disponibilidadProfesores.findMany({ where: eq(disponibilidadProfesores.profesorId, id) });
  const ofertas = await tx.select({ planificacionSemestreId: ofertasAsignaturas.planificacionSemestreId }).from(ofertasAsignaturas)
    .innerJoin(ofertaTipoHora, eq(ofertaTipoHora.ofertaId, ofertasAsignaturas.id)).where(eq(ofertaTipoHora.profesorId, id));
  return [...new Set([...disponibilidades, ...ofertas].map(fila => fila.planificacionSemestreId))].sort((a, b) => a - b);
}

export const profesoresRepository = {
  // Proyecta identidad y departamento para distinguir profesores en los selectores.
  async findSeleccion() {
    return await db.select({
      id: profesores.id,
      nombre: profesores.nombre,
      rut: profesores.rut,
      departamento: { id: departamentos.id, nombre: departamentos.nombre },
    }).from(profesores)
      .innerJoin(departamentos, eq(profesores.departamentoId, departamentos.id));
  },

  // Carga perfiles y relaciones académicas filtradas, sin campos internos de acceso de sus cuentas.
  async findAll(departamentoId?: number, alcance?: AlcanceCarrera) {
    const docentes = await db.query.profesores.findMany({
      where: and(departamentoId === undefined ? undefined : eq(profesores.departamentoId, departamentoId),
        alcance ? inArray(profesores.departamentoId, alcance.departamentosIds) : undefined),
      with: {
        departamento: true,
        usuario: { columns: { clave: false, versionSesion: false } },
        disponibilidades: alcance ? { where: inArray(disponibilidadProfesores.planificacionSemestreId, planificacionesSemestresRepository.idsEnCarrera(alcance)) } : true,
        asignaciones: { where: alcance ? inArray(ofertaTipoHora.ofertaId, db.select({ id: ofertasAsignaturas.id }).from(ofertasAsignaturas).where(inArray(ofertasAsignaturas.planificacionSemestreId, planificacionesSemestresRepository.idsEnCarrera(alcance)))) : undefined, with: { oferta: true, tipoHora: true } },
      },
    });
    return Promise.all(docentes.map(async docente => ({ ...docente,
      tieneDependenciasAcademicas: await tieneDependenciasProfesor(db, docente.id),
    })));
  },

  // Reúne el perfil y sus dependencias, acotando las relaciones académicas al alcance recibido.
  async findById(id: number, alcance?: AlcanceCarrera) {
    const docente = await db.query.profesores.findFirst({
      where: eq(profesores.id, id),
      with: {
        departamento: true,
        usuario: { columns: { clave: false, versionSesion: false } },
        disponibilidades: alcance ? { where: inArray(disponibilidadProfesores.planificacionSemestreId, planificacionesSemestresRepository.idsEnCarrera(alcance)) } : true,
        asignaciones: { where: alcance ? inArray(ofertaTipoHora.ofertaId, db.select({ id: ofertasAsignaturas.id }).from(ofertasAsignaturas).where(inArray(ofertasAsignaturas.planificacionSemestreId, planificacionesSemestresRepository.idsEnCarrera(alcance)))) : undefined, with: { oferta: true, tipoHora: true } },
      },
    });
    return docente ? { ...docente, tieneDependenciasAcademicas: await tieneDependenciasProfesor(db, id) } : undefined;
  },

  // Localiza un perfil por su identidad normalizada para detectar duplicados.
  async findByRut(rut: string) {
    return await db.query.profesores.findFirst({
      where: eq(profesores.rut, rut),
    });
  },

  // Resuelve el vínculo entre una cuenta de acceso y su perfil académico.
  async findByUsuarioId(usuarioId: number) {
    return await db.query.profesores.findFirst({
      where: eq(profesores.usuarioId, usuarioId),
    });
  },

  // Comprueba que el departamento de adscripción exista antes de vincular el perfil.
  async checkDepartamentoExists(departamentoId: number): Promise<boolean> {
    const [dept] = await db
      .select({ id: departamentos.id })
      .from(departamentos)
      .where(eq(departamentos.id, departamentoId))
      .limit(1);
    return !!dept;
  },

  // Comprueba que exista la cuenta que se pretende vincular al profesor.
  async checkUsuarioExists(usuarioId: number): Promise<boolean> {
    const [user] = await db
      .select({ id: usuarios.id })
      .from(usuarios)
      .where(eq(usuarios.id, usuarioId))
      .limit(1);
    return !!user;
  },

  // Detecta si un correo de acceso ya pertenece a una cuenta registrada.
  async checkCorreoUsuarioExists(correo: string): Promise<boolean> {
    const [user] = await db
      .select({ id: usuarios.id })
      .from(usuarios)
      .where(eq(usuarios.correo, correo))
      .limit(1);
    return !!user;
  },

  // Detecta clases vinculadas al docente mediante la asignación de cada componente.
  async hasHorarios(id: number): Promise<boolean> {
    const [horario] = await db
      .select({ id: horariosAsignaturas.id })
      .from(horariosAsignaturas)
       .innerJoin(ofertaTipoHora, and(eq(horariosAsignaturas.ofertaId, ofertaTipoHora.ofertaId), eq(horariosAsignaturas.tipoHoraId, ofertaTipoHora.tipoHoraId)))
       .where(eq(ofertaTipoHora.profesorId, id))
      .limit(1);
    return !!horario;
  },

  // Registra el perfil académico sin crear una cuenta de acceso adicional.
  async create(data: NuevoProfesor): Promise<Profesor> {
    const [created] = await db.insert(profesores).values(data).returning();
    return created;
  },

  // Crea la cuenta y el perfil vinculado en una misma transacción.
  async createWithUsuario(data: NuevoProfesor, usuario: NuevoUsuario): Promise<Profesor> {
    return await db.transaction(async (tx) => {
      const [createdUser] = await tx.insert(usuarios).values(usuario).returning();
      const [created] = await tx.insert(profesores).values({
        ...data,
        usuarioId: createdUser.id,
      }).returning();
      return created;
    });
  },

  // Actualiza el perfil bajo los bloqueos compartidos del mantenimiento de catálogos.
  async update(id: number, data: Partial<Omit<NuevoProfesor, "id">>): Promise<Profesor | undefined> {
    return conCatalogosBloqueados(async tx => {
      const [updated] = await tx
        .update(profesores)
        .set(data)
        .where(eq(profesores.id, id))
        .returning();
      return updated;
    });
  },

  // Guarda el perfil y propaga su nombre a la cuenta vinculada dentro de la misma transacción.
  async updateWithSyncedUsuarioName(id: number, data: Partial<Omit<NuevoProfesor, "id">>, usuarioId?: number | null, soloProfesor = false) {
    return conCatalogosBloqueados(async (tx) => {
      const [updated] = Object.keys(data).length > 0
        ? await tx.update(profesores).set(data).where(eq(profesores.id, id)).returning()
        : [undefined];

      if (data.nombre && usuarioId) {
        await usuariosRepository.updateEnTransaccion(tx, usuarioId, { nombre: data.nombre }, soloProfesor);
      }

      return updated;
    });
  },

  // Registra el acceso y vincula su identidad al perfil docente en conjunto.
  async createUsuarioForProfesor(id: number, usuario: NuevoUsuario): Promise<Profesor | undefined> {
    return await db.transaction(async (tx) => {
      const [createdUser] = await tx.insert(usuarios).values(usuario).returning();
      const [updated] = await tx
        .update(profesores)
        .set({ usuarioId: createdUser.id })
        .where(eq(profesores.id, id))
        .returning();
      return updated;
    });
  },

  // Reutiliza la actualización de cuentas para conservar la invalidación de sesiones correspondiente.
  async updateUsuarioForProfesor(usuarioId: number, data: Partial<Omit<NuevoUsuario, "id" | "rol" | "versionSesion">>, soloProfesor = false) {
    return db.transaction(tx => usuariosRepository.updateEnTransaccion(tx, usuarioId, data, soloProfesor));
  },

  // Desvincula y retira la cuenta sin borrar el perfil ni sus dependencias académicas.
  async deleteUsuarioForProfesor(id: number, usuarioId: number, soloProfesor = false, transaccion?: TransaccionPlanificacion): Promise<boolean> {
    // Mantiene juntos la desvinculación del perfil y el rechazo de cuentas no gestionables.
    const escribir = async (tx: TransaccionPlanificacion) => {
      await tx.update(profesores).set({ usuarioId: null }).where(eq(profesores.id, id));
      const [deleted] = await tx.delete(usuarios).where(and(eq(usuarios.id, usuarioId), soloProfesor ? eq(usuarios.rol, "profesor") : undefined)).returning();
      if (soloProfesor && !deleted) throw new ForbiddenError("La cuenta vinculada no es una cuenta de profesor gestionable");
      return !!deleted;
    };
    return transaccion ? escribir(transaccion) : db.transaction(escribir);
  },

  // Retira el perfil bajo el bloqueo de sus períodos y las restricciones referenciales existentes.
  async delete(id: number): Promise<boolean> {
    return conPlanificacionesBloqueadas(tx => periodosProfesor(tx, id), async tx => {
      const [deleted] = await tx.delete(profesores).where(eq(profesores.id, id)).returning();
      return !!deleted;
    });
  },

  // Elimina perfil, disponibilidad, asignaciones y acceso bajo los bloqueos de sus períodos.
  async deleteWithDependencias(id: number, usuarioId?: number | null, soloProfesor = false): Promise<boolean> {
    return conPlanificacionesBloqueadas(tx => periodosProfesor(tx, id), async tx => {
      await tx.delete(disponibilidadProfesores).where(eq(disponibilidadProfesores.profesorId, id));
      await tx.delete(ofertaTipoHora).where(eq(ofertaTipoHora.profesorId, id));
      if (usuarioId) {
        await profesoresRepository.deleteUsuarioForProfesor(id, usuarioId, soloProfesor, tx);
      }
      const [deleted] = await tx.delete(profesores).where(eq(profesores.id, id)).returning();
      return !!deleted;
    });
  },

  // Permite retirar administrativamente solo un perfil sin dependencias y con cuenta revalidada.
  async deleteSinDependencias(id: number, usuarioId?: number | null): Promise<boolean> {
    return conCatalogosBloqueados(async tx => {
      await exigirCatalogoSinDependencias(tx, { tipo: "profesor", id });
      // La identidad vinculada se vuelve a leer bajo bloqueo, no se confía en el DTO.
      const docente = await tx.query.profesores.findFirst({ where: eq(profesores.id, id) });
      if (!docente) return false;
      if (docente.usuarioId !== usuarioId) throw new ForbiddenError("La cuenta vinculada cambió, vuelve a consultar el profesor");
      if (docente.usuarioId) {
        await profesoresRepository.deleteUsuarioForProfesor(id, docente.usuarioId, false, tx);
      }
      const [eliminado] = await tx.delete(profesores).where(eq(profesores.id, id)).returning();
      return !!eliminado;
    });
  },
};
