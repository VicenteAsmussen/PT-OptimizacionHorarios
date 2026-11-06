import importar from '../assets/iconos/importar-archivo.svg';
import exportar from '../assets/iconos/exportar-archivo.svg';
import publicar from '../assets/iconos/publicar-archivo.svg';
import estilos from './IconoActualizar.module.css';

const iconos = { importar, exportar, publicar };

export default function IconoArchivo({ tipo }: { tipo: keyof typeof iconos }) {
  const mascara = `url("${iconos[tipo]}")`;
  return <span aria-hidden="true" className={estilos.icono}
    style={{ maskImage: mascara, WebkitMaskImage: mascara }} />;
}
