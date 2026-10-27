import { administracionPeriodosRepository as repositorio } from "../repositories/administracion-periodos.repository.js";
import type { AlcanceReinicio, ReiniciarPeriodoDTO, EstadoPeriodoDTO } from "../validations/administracion-periodos.validation.js";

export const administracionPeriodosService = {
  resumen: (id: number, alcance: AlcanceReinicio) => repositorio.resumen(id, alcance),
  reiniciar: (id: number, datos: ReiniciarPeriodoDTO) => repositorio.reiniciar(id, datos),
  cambiarEstado: (id: number, datos: EstadoPeriodoDTO) => repositorio.cambiarEstado(id, datos),
};
