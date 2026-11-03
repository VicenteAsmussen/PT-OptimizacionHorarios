import { z } from "zod";

export const resultadoParametros = z.strictObject({ id: z.coerce.number().int().positive() });
export const resultadoConsulta = z.strictObject({ semestreMalla: z.coerce.number().int().min(1).max(14).optional() });
export const resultadoExportacion = z.strictObject({ soloPendientes: z.enum(["true", "false"]).transform(valor => valor === "true").optional().default(false) });
export const resultadoRevision = z.strictObject({ revision: z.string().regex(/^[a-f0-9]{64}$/) });
export const resultadoMovimiento = resultadoRevision.extend({
  idsHorarios: z.array(z.number().int().positive()).min(2).max(16).refine(ids => new Set(ids).size === ids.length, "No repita bloques."),
  bloqueInicioId: z.number().int().positive(),
});
