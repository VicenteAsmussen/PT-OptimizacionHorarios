import ver from '../../assets/iconos/ojo.svg';
import ejecutar from '../../assets/iconos/ejecutar-modelo.svg';
import estilos from '../../components/IconoActualizar.module.css';

const iconos = { ver, ejecutar };

export default function IconoModelo({ tipo }: { tipo: keyof typeof iconos }) {
  const mascara = `url("${iconos[tipo]}")`;
  return <span aria-hidden="true" className={estilos.icono}
    style={{ maskImage: mascara, WebkitMaskImage: mascara }} />;
}
