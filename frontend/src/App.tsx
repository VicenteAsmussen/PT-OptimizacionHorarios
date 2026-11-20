import { RouterProvider } from "react-router-dom";
import { router } from "./app/router";
import { AuthProvider } from "./app/AuthProvider";
import Notificaciones from "./components/notificaciones/Notificaciones";

// Reúne la sesión, la navegación y los avisos compartidos del sistema académico.
export default function App() {
  return <AuthProvider><RouterProvider router={router} /><Notificaciones /></AuthProvider>;
}
