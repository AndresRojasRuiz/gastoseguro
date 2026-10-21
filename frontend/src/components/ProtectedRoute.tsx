import { Navigate, Outlet, useLocation } from 'react-router';
import type { Role } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { EmptyState, Spinner } from './ui';

/**
 * Protege rutas de la interfaz. Es solo una ayuda de usabilidad: la autorización real la
 * aplica siempre la API en el servidor.
 */
export function ProtectedRoute({ roles }: { roles?: Role[] }) {
  const { status, user } = useAuth();
  const location = useLocation();

  if (status === 'loading') {
    return (
      <div className="center-screen">
        <Spinner label="Comprobando la sesión…" />
      </div>
    );
  }
  if (status === 'anonymous' || !user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (roles && !roles.includes(user.role)) {
    return <EmptyState title="Acceso restringido">Tu rol no permite acceder a esta sección.</EmptyState>;
  }
  return <Outlet />;
}
