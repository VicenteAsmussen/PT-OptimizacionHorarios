import agregar from "../../assets/iconos/agregar-usuario.svg";
import ver from "../../assets/iconos/ojo.svg";
import editar from "../../assets/iconos/editar.svg";
import eliminar from "../../assets/iconos/eliminar.svg";
import acceso from "../../assets/iconos/clave-de-usuario.svg";
import retirarAcceso from "../../assets/iconos/quitar-usuario.svg";
import estilos from "./Profesores.module.css";

const iconos = { agregar, ver, editar, eliminar, acceso, retirarAcceso };

export default function IconoProfesor({ tipo }: { tipo: keyof typeof iconos }) {
  const mascara = `url("${iconos[tipo]}")`;
  return <span aria-hidden="true" className={estilos.icono}
    style={{ maskImage: mascara, WebkitMaskImage: mascara }} />;
}
