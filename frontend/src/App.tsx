import { RouterProvider } from "react-router-dom";
import { router } from "./app/router";
import { AuthProvider } from "./app/AuthProvider";
import Notificaciones from "./components/notificaciones/Notificaciones";

export default function App() {
  return <AuthProvider><RouterProvider router={router} /><Notificaciones /></AuthProvider>;
}
