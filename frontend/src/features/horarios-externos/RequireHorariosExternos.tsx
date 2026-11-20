import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { puedeGestionarHorariosExternos } from './permisos';

// Redirige las cuentas sin permiso para gestionar cargas externas.
export default function RequireHorariosExternos() {
  const { usuario } = useAuth();
  return puedeGestionarHorariosExternos(usuario?.rol) ? <Outlet /> : <Navigate to="/app/dashboard" replace />;
}
