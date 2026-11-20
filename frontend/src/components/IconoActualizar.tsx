import actualizar from '../assets/iconos/actualizar.svg';
import estilos from './IconoActualizar.module.css';

// Identifica visualmente las acciones de recarga de información académica.
export default function IconoActualizar() {
  const mascara = `url("${actualizar}")`;
  return <span aria-hidden="true" className={estilos.icono}
    style={{ maskImage: mascara, WebkitMaskImage: mascara }} />;
}
