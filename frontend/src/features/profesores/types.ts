export type TipoProfesor = "planta" | "part time";

export interface DepartamentoProfesor {
  id: number;
  nombre: string;
}

export interface CarreraProfesor {
  id: number;
  nombre: string;
  carreraDepartamentos: {
    departamentoId: number;
    esGestionado: boolean;
  }[];
}

// Modelo de lectura deliberadamente reducido: nunca contiene claves ni hashes.
export interface Profesor {
  id: number;
  rut: string;
  nombre: string;
  departamentoId: number;
  tipo: string;
  usuarioId: number | null;
  departamento: DepartamentoProfesor;
  usuario: { id: number; nombre: string; correo: string; rol: string } | null;
}

export interface AccesoProfesor {
  correo: string;
  clave: string;
}

export type CambiosAccesoProfesor =
  | { correo: string; clave?: string }
  | { correo?: string; clave: string };

export interface DatosProfesor {
  rut: string;
  nombre: string;
  departamentoId: number;
  tipo: TipoProfesor;
}

// La UI administra el acceso por sus endpoints, no vincula usuarios arbitrarios.
export interface CrearProfesor extends DatosProfesor {
  acceso?: AccesoProfesor;
}

export type EditarProfesor = Partial<DatosProfesor>;

export interface AlcanceProfesores {
  departamentosIds: readonly number[];
  departamentosGestionadosIds: readonly number[];
}

export interface FiltrosProfesores {
  busqueda?: string;
  departamentoId?: number;
  tipo?: TipoProfesor;
  acceso?: "con acceso" | "sin acceso";
}
