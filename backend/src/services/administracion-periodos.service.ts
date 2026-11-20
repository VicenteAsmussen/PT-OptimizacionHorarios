import { administracionPeriodosRepository as repositorio } from "../repositories/administracion-periodos.repository.js";
import type { AlcanceReinicio, ReiniciarPeriodoDTO, EstadoPeriodoDTO } from "../validations/administracion-periodos.validation.js";

export const administracionPeriodosService = {
  // Solicita la revisión y las cantidades del alcance administrativo antes de confirmarlo.
  resumen: (id: number, alcance: AlcanceReinicio) => repositorio.resumen(id, alcance),
  // Deriva el reinicio confirmado al repositorio que conserva sus bloqueos y validaciones.
  reiniciar: (id: number, datos: ReiniciarPeriodoDTO) => repositorio.reiniciar(id, datos),
  // Solicita la transición administrativa con comparación del estado anterior y validación del resultado.
  cambiarEstado: (id: number, datos: EstadoPeriodoDTO) => repositorio.cambiarEstado(id, datos),
};
