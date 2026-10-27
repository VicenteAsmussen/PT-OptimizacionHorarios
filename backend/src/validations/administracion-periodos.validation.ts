import { z } from "zod";

const estado = z.enum(["preparacion", "propuesta", "publicado"]);
const alcance = z.enum(["gestionadas", "externas", "todas"]);
export const resumenPeriodoValidation = z.object({ alcance }).strict();
export const reiniciarPeriodoValidation = z.object({
  objetivo: z.enum(["ofertas", "horarios"]),
  alcance,
  huella: z.string().regex(/^[a-f0-9]{64}$/),
  confirmacion: z.string().length(6).regex(/^[0-9]{4}-[12]$/),
}).strict();
export const estadoPeriodoValidation = z.object({ estadoPlanificacion: estado, estadoAnterior: estado }).strict();
export type AlcanceReinicio = z.infer<typeof alcance>;
export type ReiniciarPeriodoDTO = z.infer<typeof reiniciarPeriodoValidation>;
export type EstadoPeriodoDTO = z.infer<typeof estadoPeriodoValidation>;
