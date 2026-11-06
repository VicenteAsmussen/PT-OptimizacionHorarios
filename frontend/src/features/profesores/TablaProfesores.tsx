import { etiquetaTipoProfesor } from "./datos";
import { puedeAdministrarAcceso, puedeAdministrarProfesor } from "./permisos";
import type { AlcanceProfesores, Profesor } from "./types";
import type { AccionProfesor } from "./AccionesProfesor";
import IconoProfesor from "./IconoProfesor";
import { mantenerFocoEnTabla } from "../../lib/focoTabla";
import { useDesbordamientoTabla } from "../../hooks/useDesbordamientoTabla";
import estilos from "./Profesores.module.css";

interface Props {
  profesores: Profesor[];
  rol?: string;
  alcance: AlcanceProfesores;
  alAccionar: (accion: AccionProfesor, profesor: Profesor) => void;
}

export default function TablaProfesores({ profesores, rol, alcance, alAccionar }: Props) {
  const { referencia, desborda } = useDesbordamientoTabla();
  return <>
    {desborda && <p id="ayuda-tabla-profesores" className={estilos.ayudaTabla}>Desplaza la tabla para ver más columnas.<span className={estilos.soloLectores}> Con la tabla enfocada, usa las flechas del teclado.</span></p>}
    <div className={estilos.tablaContenedor} tabIndex={0} role="region" aria-label="Profesores y acciones" aria-describedby={desborda ? 'ayuda-tabla-profesores' : undefined} ref={referencia} onFocusCapture={mantenerFocoEnTabla}>
    <table className={estilos.tabla}>
      <caption className={estilos.soloLectores}>Profesores y sus accesos al sistema</caption>
      <thead><tr><th scope="col">Nombre</th><th scope="col">Departamento</th><th scope="col">Tipo</th>
        <th scope="col">Acceso al sistema</th><th scope="col">Acciones de profesor</th><th scope="col">Acciones de acceso</th></tr></thead>
      <tbody>{profesores.map((profesor) => {
        const gestionaProfesor = puedeAdministrarProfesor(rol, profesor, alcance);
        const gestionaAcceso = puedeAdministrarAcceso(rol, profesor, alcance);
        const conAcceso = profesor.usuarioId !== null;
        const boton = (accion: AccionProfesor, texto: string, etiqueta: string,
          icono: Parameters<typeof IconoProfesor>[0]["tipo"], variante = "gris", principal = false) => <button type="button"
          className={`boton boton--${variante} ${estilos.botonConIcono} ${principal ? estilos.accionPrincipal : estilos.accionSecundaria}`}
          aria-label={`${etiqueta}: ${profesor.nombre}`} title={`${etiqueta}: ${profesor.nombre}`}
          onClick={() => alAccionar(accion, profesor)}><IconoProfesor tipo={icono} />{texto}</button>;
        return <tr key={profesor.id}>
          <th scope="row"><span className={estilos.nombreProfesor} title={profesor.nombre}>{profesor.nombre}</span></th>
          <td>{profesor.departamento.nombre}</td>
          <td><span className={`${estilos.tipoProfesor} ${profesor.tipo === "planta" ? estilos.tipoPlanta : ""}`}>{etiquetaTipoProfesor(profesor.tipo)}</span></td>
          <td><span className={`${estilos.insignia} ${conAcceso ? estilos.conAcceso : ""}`}>{conAcceso ? "Con acceso" : "Sin acceso"}</span></td>
          <td><div className={estilos.acciones} role="group" aria-label={`Profesor: ${profesor.nombre}`}>
            {gestionaProfesor && boton("editar", "", "Editar profesor", "editar", "azul", true)}
            {boton("ver", "", "Ver profesor", "ver")}
            {gestionaProfesor && boton("eliminar", "", "Eliminar profesor", "eliminar", "eliminar")}
          </div></td>
          <td>{gestionaAcceso ? <div className={estilos.acciones} role="group" aria-label={`Acceso: ${profesor.nombre}`}>
            {conAcceso ? <>{boton("editarAcceso", "Editar", "Editar acceso", "acceso")}
              {boton("eliminarAcceso", "Retirar", "Retirar acceso", "retirarAcceso", "eliminar")}</>
              : boton("crearAcceso", "Crear", "Crear acceso", "acceso")}
          </div> : <small>Sin permisos de gestión</small>}</td>
        </tr>;
      })}</tbody>
    </table>
    </div>
  </>;
}
