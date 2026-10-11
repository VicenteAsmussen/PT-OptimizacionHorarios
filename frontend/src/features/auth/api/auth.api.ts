import { api } from "../../../lib/api";
import type { Credenciales, RespuestaExitosa, Usuario } from "../../../types/auth";

export const authApi = {
  async login(credenciales: Credenciales): Promise<Usuario> {
    const respuesta = await api<RespuestaExitosa<{ user: Usuario }>>("/auth/login", {
      method: "POST",
      body: JSON.stringify(credenciales),
    });
    return respuesta.data.user;
  },
  async getMe(signal?: AbortSignal): Promise<Usuario> {
    const respuesta = await api<RespuestaExitosa<Usuario>>("/auth/me", { signal });
    return respuesta.data;
  },
  async logout(): Promise<void> {
    await api("/auth/logout", { method: "POST" });
  },
};
