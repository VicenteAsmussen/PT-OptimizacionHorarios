import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { ApiError } from "../../lib/api";
import estilos from "./Profesores.module.css";

interface Props {
  titulo: string;
  confirmar?: string;
  destructivo?: boolean;
  children: ReactNode;
  guardar?: () => Promise<unknown>;
  alCompletar: () => void;
  alCerrar: () => void;
}

// Un único envío en vuelo; errores del servidor no desmontan los campos.
export default function DialogoProfesor({ titulo, confirmar = "Guardar", destructivo,
  children, guardar, alCompletar, alCerrar }: Props) {
  const dialogo = useRef<HTMLDialogElement>(null);
  const bloqueo = useRef(false);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const anterior = document.activeElement;
    const elemento = dialogo.current!;
    elemento.showModal();
    return () => {
      elemento.close();
      if (anterior instanceof HTMLElement && anterior.isConnected) anterior.focus();
    };
  }, []);

  async function enviar(evento: FormEvent) {
    evento.preventDefault();
    if (!guardar || bloqueo.current) return;
    bloqueo.current = true;
    setOcupado(true);
    setError("");
    try {
      await guardar();
    } catch (fallo) {
      setError(fallo instanceof ApiError || fallo instanceof Error
        ? fallo.message : "No se pudo completar la solicitud. Inténtalo nuevamente.");
      bloqueo.current = false;
      setOcupado(false);
      return;
    }
    alCompletar();
  }

  return <dialog ref={dialogo} className={`${estilos.dialogo} ${destructivo ? estilos.dialogoConfirmacion : guardar ? estilos.dialogoFormulario : estilos.dialogoConsulta}`} aria-labelledby="titulo-dialogo-profesor"
    onCancel={(evento) => { evento.preventDefault(); if (!bloqueo.current) alCerrar(); }}>
    <header className={estilos.cabeceraDialogo}>
      <h2 id="titulo-dialogo-profesor">{titulo}</h2>
      <button type="button" className={`boton boton--gris ${estilos.accionSecundaria}`} disabled={ocupado} onClick={alCerrar}>Cerrar</button>
    </header>
    <form onSubmit={enviar} className={estilos.formularioDialogo} aria-busy={ocupado} aria-describedby={error ? "error-profesor" : undefined}>
      <div className={estilos.cuerpoDialogo}>
        <fieldset disabled={ocupado} className={estilos.campos}>
          {destructivo ? <div className={estilos.avisoConfirmacion}>{children}</div> : children}
        </fieldset>
        {error && <p id="error-profesor" role="alert" className={estilos.error}>{error}</p>}
      </div>
      <footer className={`${estilos.acciones} ${estilos.pieDialogo}`}>
        <button type="button" className={`boton boton--gris ${estilos.accionSecundaria}`} disabled={ocupado} onClick={alCerrar} autoFocus={destructivo}>
          {guardar ? "Cancelar" : "Cerrar"}
        </button>
        {guardar && <button type="submit" disabled={ocupado}
          className={`boton ${destructivo ? "boton--eliminar" : estilos.accionPrincipal}`}>
          {ocupado ? "Guardando…" : confirmar}
        </button>}
      </footer>
    </form>
  </dialog>;
}
