import { etiquetaTipoProfesor } from "./datos";
import { puedeAdministrarAcceso, puedeAdministrarProfesor } from "./permisos";
import type { AlcanceProfesores, Profesor } from "./types";
import type { AccionProfesor } from "./AccionesProfesor";
import IconoProfesor from "./IconoProfesor";
import estilos from "./Profesores.module.css";

interface Props {
  profesores: Profesor[];
  rol?: string;
  alcance: AlcanceProfesores;
  alAccionar: (accion: AccionProfesor, profesor: Profesor) => void;
}

export default function TablaProfesores({ profesores, rol, alcance, alAccionar }: Props) {
  return <div className={estilos.tablaContenedor} tabIndex={0} role="region" aria-label="Profesores y acciones; desplaza horizontalmente para ver todas las columnas">
    <table className={estilos.tabla}>
      <caption className={estilos.soloLectores}>Profesores y sus accesos al sistema</caption>
      <thead><tr><th scope="col">Nombre</th><th scope="col">Departamento</th><th scope="col">Tipo</th>
        <th scope="col">Acceso al sistema</th><th scope="col">Acciones de profesor</th><th scope="col">Acciones de acceso</th></tr></thead>
      <tbody>{profesores.map((profesor) => {
        const gestionaProfesor = puedeAdministrarProfesor(rol, profesor, alcance);
        const gestionaAcceso = puedeAdministrarAcceso(rol, profesor, alcance);
        const conAcceso = profesor.usuarioId !== null;
        const boton = (accion: AccionProfesor, texto: string, etiqueta: string,
          icono: Parameters<typeof IconoProfesor>[0]["tipo"], variante = "azul") => <button type="button"
          className={`boton boton--${variante} ${estilos.botonConIcono}`} aria-label={`${etiqueta}: ${profesor.nombre}`}
          onClick={() => alAccionar(accion, profesor)}><IconoProfesor tipo={icono} />{texto}</button>;
        return <tr key={profesor.id}>
          <th scope="row"><span className={estilos.nombreProfesor} title={profesor.nombre}>{profesor.nombre}</span></th>
          <td>{profesor.departamento.nombre}</td>
          <td><span className={`${estilos.tipoProfesor} ${profesor.tipo === "planta" ? estilos.tipoPlanta : ""}`}>{etiquetaTipoProfesor(profesor.tipo)}</span></td>
          <td><span className={`${estilos.insignia} ${conAcceso ? estilos.conAcceso : ""}`}>{conAcceso ? "Con acceso" : "Sin acceso"}</span></td>
          <td><div className={estilos.acciones} role="group" aria-label={`Profesor: ${profesor.nombre}`}>
            {boton("ver", "Ver", "Ver profesor", "ver")}
            {gestionaProfesor && <>{boton("editar", "Editar", "Editar profesor", "editar", "editar")}
              {boton("eliminar", "Eliminar", "Eliminar profesor", "eliminar", "eliminar")}</>}
          </div></td>
          <td>{gestionaAcceso ? <div className={estilos.acciones} role="group" aria-label={`Acceso: ${profesor.nombre}`}>
            {conAcceso ? <>{boton("editarAcceso", "Editar", "Editar acceso", "acceso", "editar")}
              {boton("eliminarAcceso", "Retirar", "Retirar acceso", "retirarAcceso", "eliminar")}</>
              : boton("crearAcceso", "Crear", "Crear acceso", "acceso", "crear")}
          </div> : <small>Sin permisos de gestión</small>}</td>
        </tr>;
      })}</tbody>
    </table>
  </div>;
}
