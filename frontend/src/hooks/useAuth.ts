import { useContext } from "react";
import { AuthContext } from "../app/AuthProvider";

// Entrega la sesión compartida y detecta pantallas fuera de su proveedor.
export function useAuth() {
  const contexto = useContext(AuthContext);
  if (!contexto) throw new Error("useAuth debe utilizarse dentro de AuthProvider.");
  return contexto;
}
