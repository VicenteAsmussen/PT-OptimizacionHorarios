import request from "supertest";
export type { Test } from "supertest";

// Los escenarios funcionales envían la misma cabecera explícita que el frontend.
// Las pruebas CSRF usan Supertest directo para comprobar peticiones sin protección.
function crearCliente(aplicacion: Parameters<typeof request>[0]) {
  return request.agent(aplicacion).set("X-CSRF-Protection", "1");
}

export default Object.assign(crearCliente, { agent: crearCliente });
