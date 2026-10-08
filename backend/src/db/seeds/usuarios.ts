import { eq } from "drizzle-orm";
import * as esquema from "../schema/index.js";
import { hashPassword } from "../../utils/password.js";
import type { BaseDatosSeed, CatalogosAcademicosSeed } from "./contexto.js";
import { claveInicial, datosUsuarios, tipoProfesorInicial } from "./data/usuarios.js";

async function asegurarUsuario(baseDatos: BaseDatosSeed, usuario: typeof datosUsuarios[number], clave: string) {
  const [existente] = await baseDatos.select().from(esquema.usuarios).where(eq(esquema.usuarios.correo, usuario.correo)).limit(1);
  if (existente) {
    const [actualizado] = await baseDatos
      .update(esquema.usuarios)
      .set({ nombre: usuario.nombre, rol: usuario.rol })
      .where(eq(esquema.usuarios.id, existente.id))
      .returning();
    return actualizado;
  }
  const [insertado] = await baseDatos.insert(esquema.usuarios).values({ ...usuario, clave }).returning();
  return insertado;
}

export async function sembrarUsuarios(baseDatos: BaseDatosSeed, catalogos: CatalogosAcademicosSeed) {
  const claveInicialHash = await hashPassword(claveInicial);
  const usuariosAsegurados = [];
  for (const usuario of datosUsuarios) usuariosAsegurados.push(await asegurarUsuario(baseDatos, usuario, claveInicialHash));
  console.log(`✓ Asegurados ${usuariosAsegurados.length} usuarios base`);

  const usuarioSecretaria = usuariosAsegurados.find((usuario) => usuario.rol === "secretaria");
  if (usuarioSecretaria && catalogos.carreras.length > 0) {
    await baseDatos
      .insert(esquema.secretarias)
      .values({ usuarioId: usuarioSecretaria.id, carreraId: catalogos.carreras[0].id })
      .onConflictDoUpdate({
        target: esquema.secretarias.usuarioId,
        set: { carreraId: catalogos.carreras[0].id },
      });
    console.log("✓ Asegurado perfil de secretaria asociado a la carrera");
  }

  const usuarioProfesor = usuariosAsegurados.find((usuario) => usuario.rol === "profesor");
  if (usuarioProfesor && catalogos.departamentos.length > 0) {
    const [profesorExistente] = await baseDatos
      .select()
      .from(esquema.profesores)
      .where(eq(esquema.profesores.usuarioId, usuarioProfesor.id))
      .limit(1);

    if (profesorExistente) {
      await baseDatos
        .update(esquema.profesores)
        .set({
          nombre: usuarioProfesor.nombre,
          departamentoId: catalogos.departamentos[0].id,
          tipo: tipoProfesorInicial,
        })
        .where(eq(esquema.profesores.id, profesorExistente.id));
    } else {
      await baseDatos.insert(esquema.profesores).values({
        nombre: usuarioProfesor.nombre,
        departamentoId: catalogos.departamentos[0].id,
        tipo: tipoProfesorInicial,
        usuarioId: usuarioProfesor.id,
      });
    }
    console.log("✓ Asegurado perfil de profesor asociado al departamento");
  }
}
