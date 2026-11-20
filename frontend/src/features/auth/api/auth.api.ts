import { api } from "../../../lib/api";
import type { Credenciales, RespuestaExitosa, Usuario } from "../../../types/auth";

export const authApi = {
  // Solicita una sesión y devuelve la cuenta reconocida por el servidor.
  async login(credenciales: Credenciales): Promise<Usuario> {
    const respuesta = await api<RespuestaExitosa<{ user: Usuario }>>("/auth/login", {
      method: "POST",
      body: JSON.stringify(credenciales),
    });
    return respuesta.data.user;
  },
  // Recupera la cuenta asociada a la cookie de sesión del navegador.
  async getMe(signal?: AbortSignal): Promise<Usuario> {
    const respuesta = await api<RespuestaExitosa<Usuario>>("/auth/me", { signal });
    return respuesta.data;
  },
  // Solicita al servidor invalidar la sesión de la cuenta actual.
  async logout(): Promise<void> {
    await api("/auth/logout", { method: "POST" });
  },
};
