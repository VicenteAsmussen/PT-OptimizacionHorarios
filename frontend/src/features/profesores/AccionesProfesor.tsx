import { useState } from "react";
import { etiquetaTipoProfesor } from "./datos";
import DialogoProfesor from "./DialogoProfesor";
import { prepararCambiosAcceso, prepararNuevoAcceso } from "./formularios";
import { errorClaveAcceso } from "./limites";
import { puedeAdministrarAcceso, puedeAdministrarProfesor } from "./permisos";
import { profesoresApi } from "./profesores.api";
import { formatearRut } from "./rut";
import type { AlcanceProfesores, Profesor } from "./types";

export type AccionProfesor = "ver" | "editar" | "eliminar" | "crearAcceso" | "editarAcceso" | "eliminarAcceso";
interface Props {
  accion: Exclude<AccionProfesor, "editar">;
  profesor: Profesor;
  rol?: string;
  alcance: AlcanceProfesores;
  alCerrar: () => void;
  alCompletar: () => void;
}

export default function AccionesProfesor({ accion, profesor, rol, alcance, alCerrar, alCompletar }: Props) {
  const [correo, setCorreo] = useState(accion === "editarAcceso" ? profesor.usuario?.correo ?? "" : "");
  const [clave, setClave] = useState("");
  const errorClave = errorClaveAcceso(clave);
  const titulos = { ver: "Ver profesor", eliminar: "Eliminar profesor", crearAcceso: "Crear acceso al sistema",
    editarAcceso: "Editar acceso al sistema", eliminarAcceso: "Retirar acceso al sistema" };
  const esFormulario = accion === "crearAcceso" || accion === "editarAcceso";
  const destructivo = accion === "eliminar" || accion === "eliminarAcceso";
  async function guardar() {
    if (accion === "eliminar") {
      if (!puedeAdministrarProfesor(rol, profesor, alcance)) throw new Error("No tienes permiso para eliminar este profesor.");
      return profesoresApi.eliminar(profesor.id);
    }
    if (!puedeAdministrarAcceso(rol, profesor, alcance)) throw new Error("No tienes permiso para gestionar este acceso.");
    if (accion === "crearAcceso") return profesoresApi.crearAcceso(profesor.id, prepararNuevoAcceso(correo, clave));
    if (accion === "editarAcceso") {
      const cambios = prepararCambiosAcceso(correo, clave, profesor.usuario?.correo ?? "");
      if (!cambios) throw new Error("Modifica el correo o ingresa una nueva contraseña.");
      return profesoresApi.editarAcceso(profesor.id, cambios);
    }
    if (accion === "eliminarAcceso") return profesoresApi.eliminarAcceso(profesor.id);
  }

  return <DialogoProfesor titulo={titulos[accion]} destructivo={destructivo}
    confirmar={destructivo ? (accion === "eliminar" ? "Eliminar profesor" : "Retirar acceso") : "Guardar"}
    guardar={accion === "ver" ? undefined : guardar} alCerrar={alCerrar} alCompletar={alCompletar}>
    {esFormulario ? <>
      <p>Profesor: <strong>{profesor.nombre}</strong></p>
      <label htmlFor="acceso-correo">Correo electrónico</label>
      <input id="acceso-correo" type="email" autoComplete="off" maxLength={254} required={accion === "crearAcceso"}
        value={correo} onChange={(evento) => setCorreo(evento.target.value)} autoFocus />
      <label htmlFor="acceso-clave">{accion === "crearAcceso" ? "Contraseña inicial" : "Nueva contraseña (opcional)"}</label>
      <input id="acceso-clave" type="password" autoComplete="new-password" required={accion === "crearAcceso"} maxLength={72}
        aria-describedby="ayuda-acceso-clave error-acceso-clave" aria-invalid={!!errorClave}
        value={clave} onChange={(evento) => {
          setClave(evento.target.value);
          evento.target.setCustomValidity(errorClaveAcceso(evento.target.value));
        }} />
      <p id="ayuda-acceso-clave">Máximo 72 bytes UTF-8; algunos caracteres, como acentos y emojis, ocupan más de un byte.</p>
      <p id="error-acceso-clave" role={errorClave ? "alert" : undefined}>{errorClave}</p>
      {accion === "editarAcceso" && <p>Deja la contraseña vacía para conservarla. Puedes cambiar solo el correo o solo la contraseña.</p>}
    </> : accion === "ver" ? <dl>
      <dt>Nombre</dt><dd>{profesor.nombre}</dd>
      <dt>RUT</dt><dd>{formatearRut(profesor.rut)}</dd>
      <dt>Departamento</dt><dd>{profesor.departamento.nombre}</dd>
      <dt>Tipo</dt><dd>{etiquetaTipoProfesor(profesor.tipo)}</dd>
      <dt>Acceso al sistema</dt><dd>{profesor.usuarioId === null ? "Sin acceso" : "Con acceso"}</dd>
      {profesor.usuario && <><dt>Correo electrónico</dt><dd>{profesor.usuario.correo}</dd></>}
    </dl> : <>
      <p>¿Confirmas que deseas {accion === "eliminar" ? "eliminar al profesor" : "retirar el acceso al sistema de"} <strong>{profesor.nombre}</strong>?</p>
      <p>{accion === "eliminar" ? "Esta acción no se puede deshacer. Si existen horarios asociados, el servidor impedirá la eliminación."
        : "El profesor se conservará, pero ya no podrá iniciar sesión con este acceso."}</p>
    </>}
  </DialogoProfesor>;
}
