import type { RequestHandler } from "express";
import { env } from "../config/env.js";
import { ForbiddenError } from "../utils/errors.js";

// La cabecera impide formularios simples, Origin se contrasta sin confiar en Host o proxies.
// No se exige Fetch Metadata porque los navegadores pueden omitirlo sobre HTTP.
export const protegerCsrf: RequestHandler = (peticion, _respuesta, siguiente) => {
  if (["GET", "HEAD", "OPTIONS"].includes(peticion.method)) {
    siguiente();
    return;
  }
  const origen = peticion.get("Origin");
  if (peticion.get("X-CSRF-Protection") !== "1"
    || (origen !== undefined && origen !== env.CLIENT_URL)
    || peticion.get("Sec-Fetch-Site") === "cross-site") {
    siguiente(new ForbiddenError("Solicitud rechazada por protección CSRF."));
    return;
  }
  siguiente();
};
