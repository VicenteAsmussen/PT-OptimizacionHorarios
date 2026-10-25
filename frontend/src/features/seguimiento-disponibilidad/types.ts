export interface FilaSeguimiento {
  profesorId: number;
  nombre: string;
  departamento: { id: number; nombre: string };
  minimoBloques: number;
  bloquesEnviados: number;
  enviada: boolean;
}
