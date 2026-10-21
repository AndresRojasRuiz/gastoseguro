import { BrowserRouter, Link, Route, Routes } from 'react-router';
import { AuthProvider } from './auth/AuthContext';
import { Layout } from './components/Layout';
import { ProtectedRoute } from './components/ProtectedRoute';
import { EmptyState } from './components/ui';
import { AdminUsersPage, AlertsPage, AuditPage } from './pages/AdminPages';
import { LoginPage, RegisterPage } from './pages/AuthPages';
import { CategoriesPage } from './pages/CategoriesPage';
import { DashboardPage } from './pages/DashboardPage';
import { ExpensesPage } from './pages/ExpensesPage';
import { SecurityPage } from './pages/SecurityPage';

function NotFound() {
  return (
    <div className="center-screen">
      <EmptyState title="Página no encontrada">
        <Link to="/">Volver al inicio</Link>
      </EmptyState>
    </div>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/registro" element={<RegisterPage />} />
          <Route element={<ProtectedRoute />}>
            <Route element={<Layout />}>
              <Route index element={<DashboardPage />} />
              <Route path="gastos" element={<ExpensesPage />} />
              <Route path="categorias" element={<CategoriesPage />} />
              <Route path="seguridad" element={<SecurityPage />} />
              <Route element={<ProtectedRoute roles={['ADMIN']} />}>
                <Route path="admin/usuarios" element={<AdminUsersPage />} />
              </Route>
              <Route element={<ProtectedRoute roles={['ADMIN', 'AUDITOR']} />}>
                <Route path="auditoria" element={<AuditPage />} />
                <Route path="alertas" element={<AlertsPage />} />
              </Route>
            </Route>
          </Route>
          <Route path="*" element={<NotFound />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
