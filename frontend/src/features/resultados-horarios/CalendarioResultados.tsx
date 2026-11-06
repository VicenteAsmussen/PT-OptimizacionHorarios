import { useEffect, useRef, useState } from 'react';
import { claveDia } from '../disponibilidad/estado';
import { bloquesDestino, estadoCasilla, estadoDestino, etiquetasSala, etiquetaSesion, esSesionLista, inicioParejaDestino, puedeMoverSesion, rangoBloque, sesionesVisibles } from './modelo';
import type { ResultadoHorario, SesionResultado } from './types';
import { distribuirReservas, distribuirSesiones, identidadSesion } from './calendario/disposicion';
import { crearGesto } from './calendario/gesto';
import { nombreCompacto, lineasCompactas } from './calendario/presentacion';
import calendario from './calendario/Calendario.module.css';
import estilos from './ResultadosHorarios.module.css';

interface Propiedades {
  resultado: ResultadoHorario; nivel: string; seleccionar: (sesion: SesionResultado) => void; ocupado?: boolean; editar?: boolean;
  movimiento?: { sesion: SesionResultado; idsHorarios: number[]; cantidad: number; inicioId: number; invalido: boolean; elegir: (id: number) => void };
}
export default function CalendarioResultados({ resultado, nivel, seleccionar, ocupado, editar = false, movimiento }: Propiedades) {
  const sesiones = sesionesVisibles(resultado, nivel);
  const disposicion = distribuirSesiones(resultado.bloques, sesiones);
  const franjas = disposicion.franjas;
  const dias = disposicion.dias.map(dia => ({ ...dia, ancho: dia.carriles + (editar || movimiento ? 1 : 0),
    anchoCarril: dia.carriles >= 2 ? 7 : 14 }));
  const reservas = distribuirReservas(resultado.bloques, resultado.bloquesReservadosIds ?? []);
  const destinos = movimiento ? bloquesDestino(resultado.bloques, movimiento.inicioId, movimiento.cantidad).map(b => b.id) : [];
  const [anuncio, setAnuncio] = useState('');
  const [arrastre, setArrastre] = useState<{ bloqueId: number | null; valido: boolean } | null>(null);
  const actuales = useRef({ resultado, movimiento, ocupado, editar });
  actuales.current = { resultado, movimiento, ocupado, editar };
  const gesto = useRef<ReturnType<typeof crearGesto> | null>(null);
  function bloqueBajoPuntero(x: number, y: number) {
    const elemento = document.elementsFromPoint(x, y).map(e => e.closest<HTMLElement>('[data-destino-id]')).find(Boolean);
    const id = Number(elemento?.dataset.destinoId);
    return inicioParejaDestino(actuales.current.resultado.bloques, id)?.id ?? null;
  }
  function admiteGrupo(id: number | null) {
    const actual = actuales.current;
    return Boolean(id !== null && actual.movimiento
      && estadoDestino(actual.resultado, actual.movimiento.sesion, id, actual.movimiento.cantidad) === 'disponible');
  }
  if (!gesto.current) gesto.current = crearGesto({
    preparado: identidad => {
      const actual = actuales.current;
      return Boolean(actual.editar && !actual.ocupado && Array.isArray(actual.resultado.disponibilidades)
        && actual.movimiento && identidadSesion(actual.movimiento.sesion) === identidad);
    },
    destino: (x, y) => {
      const id = bloqueBajoPuntero(x, y);
      return admiteGrupo(id) ? id : null;
    },
    representar: puntero => {
      if (!puntero) { setArrastre(null); return; }
      const id = bloqueBajoPuntero(puntero.clientX, puntero.clientY);
      const valido = admiteGrupo(id);
      setArrastre(anterior => anterior?.bloqueId === id && anterior.valido === valido ? anterior : { bloqueId: id, valido });
    },
    elegir: id => actuales.current.movimiento?.elegir(id), anunciar: setAnuncio,
  }, { programar: setTimeout.bind(globalThis), cancelar: clearTimeout.bind(globalThis) });
  useEffect(() => {
    const controlador = gesto.current!;
    const cancelar = () => controlador.cancelar();
    const teclado = (evento: KeyboardEvent) => { if (['Escape', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'PageUp', 'PageDown', 'Home', 'End', ' ', 'Tab'].includes(evento.key)) cancelar(); };
    // La selección puede provocar scroll del documento por reflujo antes de activar el gesto.
    // Wheel, teclado y movimiento táctil distinguen la intención de desplazarse del usuario.
    const desplazar = (evento: Event) => { if (controlador.activo() || evento.target !== document) cancelar(); };
    const tactil = (evento: TouchEvent) => { if (controlador.activo()) evento.preventDefault(); };
    window.addEventListener('pointermove', controlador.mover, { passive: false });
    window.addEventListener('pointerup', controlador.soltar);
    window.addEventListener('pointercancel', cancelar);
    window.addEventListener('scroll', desplazar, true);
    window.addEventListener('wheel', cancelar, { passive: true });
    window.addEventListener('keydown', teclado);
    window.addEventListener('touchmove', tactil, { passive: false });
    return () => {
      cancelar();
      window.removeEventListener('pointermove', controlador.mover);
      window.removeEventListener('pointerup', controlador.soltar);
      window.removeEventListener('pointercancel', cancelar);
      window.removeEventListener('scroll', desplazar, true);
      window.removeEventListener('wheel', cancelar);
      window.removeEventListener('keydown', teclado);
      window.removeEventListener('touchmove', tactil);
    };
  }, []);
  useEffect(() => { gesto.current?.cancelar(); }, [ocupado, editar, resultado.revision]);
  const grupoAnterior = useRef<string | undefined>(undefined);
  const identidadGrupo = movimiento?.idsHorarios.join(',');
  useEffect(() => {
    if (grupoAnterior.current !== undefined && grupoAnterior.current !== identidadGrupo) gesto.current?.cancelar();
    grupoAnterior.current = identidadGrupo;
  }, [identidadGrupo]);
  const mostrarPrevia = movimiento && !movimiento.invalido
    && sesiones.some(s => s.idsHorarios[0] === movimiento.sesion.idsHorarios[0])
    && estadoDestino(resultado, movimiento.sesion, movimiento.inicioId, movimiento.cantidad) === 'disponible';
  const inicioPrevia = mostrarPrevia ? resultado.bloques.find(b => b.id === movimiento.inicioId) : undefined;
  let columna = 2;
  const columnas = dias.map(dia => { const inicio = columna; columna += dia.ancho; return inicio; });
  const bloqueArrastre = resultado.bloques.find(b => b.id === arrastre?.bloqueId);
  const diaArrastre = bloqueArrastre ? dias.findIndex(d => d.clave === claveDia(bloqueArrastre.dia)) : -1;
  const filaArrastre = bloqueArrastre ? franjas.indexOf(rangoBloque(bloqueArrastre)) : -1;
  const origenArrastre = movimiento?.idsHorarios.map(id => resultado.bloques.find(b => b.id === movimiento.sesion.bloquesIds[movimiento.sesion.idsHorarios.indexOf(id)]));
  const rangoOrigen = origenArrastre?.[0] && origenArrastre.at(-1) ? `${origenArrastre[0].horaInicio.slice(0, 5)}–${origenArrastre.at(-1)!.horaTermino.slice(0, 5)}` : '';
  const tipoGrupo = movimiento?.cantidad === movimiento?.sesion.idsHorarios.length ? 'Sesión completa' : 'Grupo parcial';
  const mensajeArrastre = arrastre && !bloqueArrastre ? `Arrastrando ${movimiento?.cantidad} bloques. Sitúa el puntero sobre un bloque existente para ver el destino.` : anuncio;
  return <>
    <p className={calendario.ayuda}>{movimiento ? `Disponibilidad de ${movimiento.sesion.profesor.nombre}. Arrastra con el mouse, mantén presionado en pantalla táctil, o elige un destino para el grupo seleccionado.`
      : editar ? 'Elige una sesión editable. Arrastra con el mouse, mantén presionado en pantalla táctil, o elige un destino después de seleccionarla.' : 'Selecciona una clase para ver su detalle. Las clases simultáneas se muestran en carriles separados.'}
    </p>
    <div className={calendario.anuncio} aria-live="polite" aria-atomic="true">{mensajeArrastre}</div>
    <div className={calendario.desplazamiento} tabIndex={0} role="region" aria-label="Calendario semanal de la carrera">
    <div className={calendario.calendario} data-editando={editar} aria-label="Horario semanal" style={{ gridTemplateColumns: `7rem ${dias.map(d => `repeat(${d.carriles}, ${d.anchoCarril}rem)${editar || movimiento ? ' 6rem' : ''}`).join(' ')}`, gridTemplateRows: `3rem repeat(${franjas.length}, minmax(2.75rem, auto))` }}>
      <div className={`${calendario.cabecera} ${calendario.esquina}`} style={{ gridColumn: 1, gridRow: 1 }}>Horario</div>
      {dias.map((dia, indice) => <div key={dia.clave} className={calendario.cabecera} style={{ gridColumn: `${columnas[indice]} / span ${dia.ancho}`, gridRow: 1 }}><span>{dia.nombre}</span></div>)}
      {franjas.map((franja, fila) => <div key={franja} className={calendario.hora} style={{ gridColumn: 1, gridRow: fila + 2 }}>{franja}</div>)}
      {dias.map((dia, indice) => <section key={dia.clave} className={calendario.dia} aria-label={dia.nombre}>
        {franjas.map((franja, fila) => {
          const bloque = resultado.bloques.find(b => claveDia(b.dia) === dia.clave && rangoBloque(b) === franja);
          const estado = bloque && movimiento ? estadoCasilla(resultado, movimiento.sesion, bloque.id) : null;
          const inicio = bloque ? inicioParejaDestino(resultado.bloques, bloque.id) : undefined;
          const estadoInicio = movimiento && inicio ? estadoDestino(resultado, movimiento.sesion, inicio.id, movimiento.cantidad) : 'fueraDeRango';
          const disponible = estado === 'disponible';
          const destino = bloque && destinos.includes(bloque.id);
          const descripcion = estado === 'reservado' ? 'Reservado' : disponible ? 'Libre con disponibilidad' : estado === 'ocupado' ? 'Ocupado' : 'Sin disponibilidad';
          const etiqueta = disponible ? 'Libre' : estado === 'sinDisponibilidad' ? 'No disponible' : descripcion;
          const bloqueAnterior = resultado.bloques.find(b => claveDia(b.dia) === dia.clave && rangoBloque(b) === franjas[fila - 1]);
          const inicioEstado = !bloqueAnterior || !movimiento || estadoCasilla(resultado, movimiento.sesion, bloqueAnterior.id) !== estado;
          return <div key={franja} data-destino-id={bloque?.id} className={calendario.casilla}
            style={{ gridColumn: `${columnas[indice]} / span ${dia.ancho}`, gridRow: fila + 2 }}>
            {!bloque ? <span>Sin bloque</span> : <>
              {movimiento && <button type="button" className={`${calendario.destino} ${disponible ? calendario.disponible : calendario.sinDisponibilidad} ${destino ? estilos.destinoSeleccionado : ''}`}
                data-inicio-estado={inicioEstado} disabled={ocupado || estadoInicio !== 'disponible'}
                aria-pressed={inicio?.id === movimiento.inicioId} onClick={evento => { if (gesto.current?.consumirClick() && evento.detail !== 0) return; if (!ocupado && inicio && estadoInicio === 'disponible') movimiento.elegir(inicio.id); }}
                aria-label={`${bloque.dia} ${rangoBloque(bloque)}: ${descripcion.toLowerCase()}${inicio ? `; destino de ${movimiento.cantidad} bloques desde ${inicio.horaInicio.slice(0, 5)}` : ''}${estadoInicio === 'reservado' ? '; el grupo incluye una reserva' : estadoInicio === 'fueraDeRango' ? '; sin espacio para todo el grupo' : estadoInicio === 'ocupado' ? '; el grupo incluye un bloque ocupado' : estadoInicio === 'sinDisponibilidad' ? '; falta disponibilidad para todo el grupo' : ''}`}>
                <span>{etiqueta}</span>
              </button>}
              {destino && mostrarPrevia && <div className={`${calendario.previa} ${estilos.vistaPrevia}`}
                data-bloque-id={bloque.id} aria-hidden="true" />}
            </>}
          </div>;
        })}
        {reservas.filter(reserva => reserva.dia === dia.clave).map(reserva => <div
          key={reserva.bloquesIds.join(',')} data-reserva={reserva.bloquesIds.join(',')} className={calendario.reserva}
          style={{ gridColumn: `${columnas[indice]} / span ${dia.ancho}`, gridRow: `${reserva.inicio + 2} / span ${reserva.fin - reserva.inicio}` }}
          role="note" aria-label={`Reservado: ${dia.nombre}, ${reserva.bloquesIds.map(id => rangoBloque(resultado.bloques.find(b => b.id === id)!)).join(', ')}`}>
          <span>Reservado</span>
        </div>)}
        {dia.tarjetas.map(({ sesion, inicio, fin, carril }) => {
          const seleccionada = movimiento && identidadSesion(movimiento.sesion) === identidadSesion(sesion);
          const bloqueada = ocupado || Boolean(editar && (!puedeMoverSesion(resultado, sesion) || (movimiento && !seleccionada)));
          const salas = [...new Set(sesion.salas.map(sala => sala?.nombre ?? 'Sin sala'))];
          const salaVisible = sesion.estadoSala === 'asignada' ? salas.length > 1 ? 'Salas por tramo' : salas[0] : etiquetasSala[sesion.estadoSala];
          const conReserva = sesion.bloquesIds.some(id => resultado.bloquesReservadosIds?.includes(id));
          const nombre = nombreCompacto(sesion.asignatura.nombre) || sesion.asignatura.codigo;
          const ambiguo = sesiones.some(otra => otra.asignatura.codigo !== sesion.asignatura.codigo
            && nombreCompacto(otra.asignatura.nombre) === nombre);
          return <button key={identidadSesion(sesion)} data-sesion={identidadSesion(sesion)} data-carril={carril} data-compacta={true} data-arrastrando={Boolean(seleccionada && arrastre)} type="button" disabled={bloqueada}
            className={`${calendario.clase} ${sesion.estadoSala === 'externa' ? estilos.sesionExterna : esSesionLista(sesion) || sesion.estadoSala === 'noRequiere' ? estilos.sesionLista : estilos.sesionPendiente}`}
            style={{ gridColumn: columnas[indice] + carril, gridRow: `${inicio + 2} / span ${fin - inicio}` }}
            aria-haspopup={editar ? undefined : 'dialog'} aria-pressed={editar ? Boolean(seleccionada) : undefined}
            aria-controls={seleccionada ? 'controles-movimiento' : undefined}
            aria-label={`${etiquetaSesion(sesion)}, ${sesion.profesor.nombre}, ${etiquetasSala[sesion.estadoSala]}`}
            onClick={evento => { const suprimir = gesto.current?.consumirClick(); if ((!suprimir || evento.detail === 0) && !bloqueada) seleccionar(sesion); }}
            onPointerDown={evento => {
              if (evento.button !== 0 || !evento.isPrimary) return;
              gesto.current?.consumirClick();
              if (!editar || bloqueada) return;
              if (!movimiento) seleccionar(sesion);
              gesto.current?.iniciar(evento, evento.currentTarget, identidadSesion(sesion));
            }}
            onLostPointerCapture={() => gesto.current?.cancelar()} onDragStart={evento => evento.preventDefault()}
            onContextMenu={evento => { if (editar && !bloqueada) evento.preventDefault(); }}>
            <strong>{nombre}{ambiguo ? ` · ${sesion.asignatura.codigo}` : ''}</strong>
            {lineasCompactas(sesion, salaVisible).map((linea, indice) => <span key={indice}>{linea}</span>)}
            {conReserva && <span className={calendario.coincideReserva}>Incluye reserva</span>}
          </button>;
        })}
        {inicioPrevia && movimiento && claveDia(inicioPrevia.dia) === dia.clave && <div
          data-resumen-previa={inicioPrevia.id} className={`${calendario.resumenPrevia} ${estilos.vistaPrevia}`}
          style={{ gridColumn: columnas[indice] + dia.ancho - 1, gridRow: `${franjas.indexOf(rangoBloque(inicioPrevia)) + 2} / span ${destinos.length}` }}
          role="note" aria-label={`Vista previa sin guardar: ${etiquetaSesion(movimiento.sesion)}, ${movimiento.sesion.profesor.nombre}`}>
          <strong>{movimiento.cantidad} bloques</strong>
          <span>{inicioPrevia.horaInicio.slice(0, 5)}</span>
          <span>Sin guardar</span>
        </div>}
      </section>)}
      {arrastre && movimiento && bloqueArrastre && diaArrastre >= 0 && filaArrastre >= 0 && <div
        className={`${calendario.guiaArrastre} ${arrastre.valido ? calendario.guiaValida : calendario.guiaInvalida}`}
        data-grupo-arrastrado={movimiento.idsHorarios.join(',')} data-destino-arrastre={bloqueArrastre.id} data-destino-valido={arrastre.valido}
        aria-label={`Arrastrando ${etiquetaSesion(movimiento.sesion)}, ${movimiento.sesion.profesor.nombre}. ${tipoGrupo}, ${movimiento.cantidad} bloques. Origen: ${movimiento.sesion.dia} ${rangoOrigen}. ${arrastre.valido ? 'Destino posible' : 'Destino no válido'}: ${bloqueArrastre.dia} ${bloqueArrastre.horaInicio.slice(0, 5)}. Sin guardar.`}
        style={{ gridColumn: columnas[diaArrastre] + dias[diaArrastre].ancho - 1, gridRow: `${Math.min(filaArrastre, Math.max(0, franjas.length - movimiento.cantidad)) + 2} / span ${Math.min(movimiento.cantidad, franjas.length)}` }}>
        <div className={calendario.tarjetaArrastre}>
        <strong>{movimiento.cantidad} bloques</strong>
        <span>{bloqueArrastre.horaInicio.slice(0, 5)}</span>
        <span>{arrastre.valido ? 'Válido' : 'No válido'}</span>
        <span>Sin guardar</span>
        </div>
      </div>}
    </div></div>
  </>;
}
