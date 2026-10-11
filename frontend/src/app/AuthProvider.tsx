import { createContext, useEffect, useState, type ReactNode } from "react";
import { authApi } from "../features/auth/api/auth.api";
import { ApiError } from "../lib/api";
import type { Credenciales, Usuario } from "../types/auth";

interface ContextoAuth {
  usuario: Usuario | null;
  cargando: boolean;
  errorSesion: string | null;
  login: (credenciales: Credenciales) => Promise<void>;
  logout: () => Promise<void>;
}

export const AuthContext = createContext<ContextoAuth | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [usuario, setUsuario] = useState<Usuario | null>(null);
  const [cargando, setCargando] = useState(true);
  const [errorSesion, setErrorSesion] = useState<string | null>(null);

  useEffect(() => {
    const controlador = new AbortController();
    authApi.getMe(controlador.signal)
      .then((actual) => {
        if (!controlador.signal.aborted) setUsuario(actual);
      })
      .catch((error: unknown) => {
        if (controlador.signal.aborted) return;
        if (!(error instanceof ApiError && error.status === 401)) {
          setErrorSesion("No se pudo comprobar la sesión. Puedes intentar iniciar sesión.");
        }
      })
      .finally(() => {
        if (!controlador.signal.aborted) setCargando(false);
      });
    return () => controlador.abort();
  }, []);

  async function login(credenciales: Credenciales) {
    const actual = await authApi.login(credenciales);
    setUsuario(actual);
    setErrorSesion(null);
  }

  async function logout() {
    await authApi.logout();
    setUsuario(null);
    setErrorSesion(null);
  }

  return (
    <AuthContext.Provider value={{ usuario, cargando, errorSesion, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
