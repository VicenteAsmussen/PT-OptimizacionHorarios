import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import { app } from "../src/app.js";

describe("Autenticación y Sesión (/api/auth)", () => {
  it("Debe fallar al intentar iniciar sesión con credenciales incorrectas (401)", async () => {
    const response = await request(app)
      .post("/api/auth/login")
      .send({
        correo: "usuario_fantasma@ubiobio.cl",
        clave: "clave_incorrecta",
      });

    expect(response.status).toBe(401);
    expect(response.body.status).toBe("error");
  });

  it("Debe iniciar sesión exitosamente y setear la cookie auth_token (200)", async () => {
    const response = await request(app)
      .post("/api/auth/login")
      .send({
        correo: "admin@ubiobio.cl",
        clave: "123456",
      });

    expect(response.status).toBe(200);
    expect(response.body.status).toBe("success");
    expect(response.body.data.user.correo).toBe("admin@ubiobio.cl");
    expect(response.body.data.user.rol).toBe("admin");

    // Verificar que devuelve la cookie
    const cookies = response.headers["set-cookie"];
    expect(cookies).toBeDefined();
    expect(cookies.some((c: string) => c.includes("auth_token="))).toBe(true);
  });

  it("Debe rechazar GET /api/auth/me sin autenticación (401)", async () => {
    const response = await request(app).get("/api/auth/me");
    expect(response.status).toBe(401);
  });

  it("Debe retornar el usuario actual en GET /api/auth/me con cookie válida", async () => {
    // 1. Login
    const loginRes = await request(app)
      .post("/api/auth/login")
      .send({
        correo: "secretaria@ubiobio.cl",
        clave: "123456",
      });

    const cookie = loginRes.headers["set-cookie"];

    // 2. /me
    const meRes = await request(app)
      .get("/api/auth/me")
      .set("Cookie", cookie);

    expect(meRes.status).toBe(200);
    expect(meRes.body.status).toBe("success");
    expect(meRes.body.data.correo).toBe("secretaria@ubiobio.cl");
    expect(meRes.body.data.rol).toBe("secretaria");
  });

  it("Debe cerrar sesión y limpiar la cookie en POST /api/auth/logout", async () => {
    const response = await request(app).post("/api/auth/logout");

    expect(response.status).toBe(200);
    expect(response.body.status).toBe("success");
    const cookies = response.headers["set-cookie"];
    expect(cookies).toBeDefined();
  });
});
