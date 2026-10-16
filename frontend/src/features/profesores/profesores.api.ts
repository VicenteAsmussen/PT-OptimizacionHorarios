import { api } from "../../lib/api";
import type { RespuestaExitosa } from "../../types/auth";
import { seleccionarCarrera, seleccionarDepartamento, seleccionarProfesor } from "./datos";
import type {
  AccesoProfesor, CambiosAccesoProfesor, CarreraProfesor, CrearProfesor,
  DepartamentoProfesor, EditarProfesor, Profesor,
} from "./types";

// api conserva cookies y propaga ApiError(message, status), incluidos 400/403/409.
// No se capturan errores aquí: F2 puede mostrarlos sin descartar el formulario.
async function solicitarProfesor(ruta: string, opciones?: RequestInit): Promise<Profesor> {
  const respuesta = await api<RespuestaExitosa<Profesor>>(ruta, opciones);
  return seleccionarProfesor(respuesta.data);
}

function cuerpo(datos: object): Pick<RequestInit, "body"> {
  return { body: JSON.stringify(datos) };
}

export const profesoresApi = {
  async listar(departamentoId?: number): Promise<Profesor[]> {
    const consulta = departamentoId === undefined ? "" : `?departamentoId=${departamentoId}`;
    const respuesta = await api<RespuestaExitosa<Profesor[]>>(`profesores${consulta}`);
    return respuesta.data.map(seleccionarProfesor);
  },
  obtener(id: number): Promise<Profesor> {
    return solicitarProfesor(`profesores/${id}`);
  },
  crear(datos: CrearProfesor): Promise<Profesor> {
    return solicitarProfesor("profesores", { method: "POST", ...cuerpo(datos) });
  },
  editar(id: number, datos: EditarProfesor): Promise<Profesor> {
    return solicitarProfesor(`profesores/${id}`, { method: "PUT", ...cuerpo(datos) });
  },
  eliminar(id: number): Promise<void> {
    return api<void>(`profesores/${id}`, { method: "DELETE" });
  },
  crearAcceso(id: number, datos: AccesoProfesor): Promise<Profesor> {
    return solicitarProfesor(`profesores/${id}/usuario`, { method: "POST", ...cuerpo(datos) });
  },
  editarAcceso(id: number, datos: CambiosAccesoProfesor): Promise<Profesor> {
    return solicitarProfesor(`profesores/${id}/usuario`, { method: "PUT", ...cuerpo(datos) });
  },
  eliminarAcceso(id: number): Promise<void> {
    return api<void>(`profesores/${id}/usuario`, { method: "DELETE" });
  },
  async listarDepartamentos(): Promise<DepartamentoProfesor[]> {
    const respuesta = await api<RespuestaExitosa<DepartamentoProfesor[]>>("departamentos");
    return respuesta.data.map(seleccionarDepartamento);
  },
  // El servidor filtra por la carrera de la secretaria autenticada.
  async listarCarreras(): Promise<CarreraProfesor[]> {
    const respuesta = await api<RespuestaExitosa<CarreraProfesor[]>>("carreras");
    return respuesta.data.map(seleccionarCarrera);
  },
};
