import { api } from "../../lib/api";
import type { RespuestaExitosa } from "../../types/auth";
import { seleccionarCarrera, seleccionarDepartamento, seleccionarProfesor } from "./datos";
import type {
  AccesoProfesor, CambiosAccesoProfesor, CarreraProfesor, CrearProfesor,
  DepartamentoProfesor, EditarProfesor, Profesor,
} from "./types";

// api conserva cookies y propaga ApiError(message, status), incluidos 400/403/409.
// No se capturan los errores aquí, el formulario puede mostrarlos sin perder sus campos.
// Extrae la ficha docente permitida de una respuesta de consulta o escritura.
async function solicitarProfesor(ruta: string, opciones?: RequestInit): Promise<Profesor> {
  const respuesta = await api<RespuestaExitosa<Profesor>>(ruta, opciones);
  return seleccionarProfesor(respuesta.data);
}

// Serializa los campos que se enviarán a una operación de gestión docente.
function cuerpo(datos: object): Pick<RequestInit, "body"> {
  return { body: JSON.stringify(datos) };
}

export const profesoresApi = {
  // Consulta el catálogo docente con un filtro opcional de departamento.
  async listar(departamentoId?: number): Promise<Profesor[]> {
    const consulta = departamentoId === undefined ? "" : `?departamentoId=${departamentoId}`;
    const respuesta = await api<RespuestaExitosa<Profesor[]>>(`profesores${consulta}`);
    return respuesta.data.map(seleccionarProfesor);
  },
  // Recupera la ficha de un docente identificado en el catálogo.
  obtener(id: number): Promise<Profesor> {
    return solicitarProfesor(`profesores/${id}`);
  },
  // Solicita registrar la identidad docente y su acceso inicial opcional.
  crear(datos: CrearProfesor): Promise<Profesor> {
    return solicitarProfesor("profesores", { method: "POST", ...cuerpo(datos) });
  },
  // Solicita actualizar los campos de identidad del docente elegido.
  editar(id: number, datos: EditarProfesor): Promise<Profesor> {
    return solicitarProfesor(`profesores/${id}`, { method: "PUT", ...cuerpo(datos) });
  },
  // Solicita eliminar al docente sujeto a las restricciones del servidor.
  eliminar(id: number): Promise<void> {
    return api<void>(`profesores/${id}`, { method: "DELETE" });
  },
  // Solicita asociar un acceso nuevo al docente existente.
  crearAcceso(id: number, datos: AccesoProfesor): Promise<Profesor> {
    return solicitarProfesor(`profesores/${id}/usuario`, { method: "POST", ...cuerpo(datos) });
  },
  // Solicita cambiar el correo o la contraseña del acceso docente.
  editarAcceso(id: number, datos: CambiosAccesoProfesor): Promise<Profesor> {
    return solicitarProfesor(`profesores/${id}/usuario`, { method: "PUT", ...cuerpo(datos) });
  },
  // Solicita retirar el acceso sin eliminar la identidad del profesor.
  eliminarAcceso(id: number): Promise<void> {
    return api<void>(`profesores/${id}/usuario`, { method: "DELETE" });
  },
  // Recupera los departamentos que contextualizan las fichas docentes.
  async listarDepartamentos(): Promise<DepartamentoProfesor[]> {
    const respuesta = await api<RespuestaExitosa<DepartamentoProfesor[]>>("departamentos");
    return respuesta.data.map(seleccionarDepartamento);
  },
  // El servidor filtra por la carrera de la cuenta de secretaría autenticada.
  // Recupera las relaciones de carrera usadas para delimitar la gestión docente.
  async listarCarreras(): Promise<CarreraProfesor[]> {
    const respuesta = await api<RespuestaExitosa<CarreraProfesor[]>>("carreras");
    return respuesta.data.map(seleccionarCarrera);
  },
};
