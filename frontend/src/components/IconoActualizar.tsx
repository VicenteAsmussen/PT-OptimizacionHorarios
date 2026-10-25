import actualizar from '../assets/iconos/actualizar.svg';
import estilos from './IconoActualizar.module.css';

export default function IconoActualizar() {
  const mascara = `url("${actualizar}")`;
  return <span aria-hidden="true" className={estilos.icono}
    style={{ maskImage: mascara, WebkitMaskImage: mascara }} />;
}
