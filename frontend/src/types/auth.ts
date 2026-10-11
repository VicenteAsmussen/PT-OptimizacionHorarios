export interface Usuario {
  id: number;
  nombre: string;
  correo: string;
  rol: string;
}

export interface Credenciales {
  correo: string;
  clave: string;
}

export interface RespuestaExitosa<T> {
  status: "success";
  data: T;
}
