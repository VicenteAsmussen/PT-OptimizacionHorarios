import { describe, expect, it } from "vitest";
import request from "supertest";
import { app } from "../src/app.js";

describe("Estado del servicio (/api/health)", () => {
  it("Debe responder públicamente con el estado, la fecha y el servicio (200)", async () => {
    const inicio = Date.now();
    const res = await request(app).get("/api/health");
    const fin = Date.now();

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("application/json");
    expect(res.body).toEqual({
      status: "ok",
      timestamp: expect.any(String),
      service: "PT-OptimizacionHorarios Backend",
    });
    const fecha = Date.parse(res.body.timestamp);
    expect(Number.isFinite(fecha)).toBe(true);
    expect(new Date(fecha).toISOString()).toBe(res.body.timestamp);
    expect(fecha).toBeGreaterThanOrEqual(inicio);
    expect(fecha).toBeLessThanOrEqual(fin);
  });
});
