import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client';
import type { AdminUser, AuditEntry, ChainVerification, Paginated, Role, SecurityAlert } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { CheckIcon, ShieldIcon } from '../components/Icons';
import { ReauthDialog } from '../components/ReauthDialog';
import { Badge, EmptyState, ErrorNotice, Notice, PageHeader, Pagination, Spinner } from '../components/ui';
import { ACTION_LABELS, ALERT_LABELS, formatDateTime, OUTCOME_LABELS, ROLE_LABELS } from '../lib/format';

// --- Usuarios --------------------------------------------------------------------------------

export function AdminUsersPage() {
  const { user: me } = useAuth();
  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');
  const [data, setData] = useState<Paginated<AdminUser> | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [revokeAll, setRevokeAll] = useState(false);

  const load = useCallback(async () => {
    try {
      setData(await api.get<Paginated<AdminUser>>('/admin/users', { page, q, pageSize: 20 }));
    } catch (caught) {
      setError(caught);
    }
  }, [page, q]);

  useEffect(() => {
    void load();
  }, [load]);

  const act = async (action: () => Promise<unknown>, success: string) => {
    setError(null);
    try {
      await action();
      setMessage(success);
      await load();
    } catch (caught) {
      setError(caught);
    }
  };

  return (
    <>
      <PageHeader
        title="Usuarios"
        subtitle="Gestión de cuentas y privilegios. Los administradores no tienen acceso a los gastos de los usuarios."
        actions={
          <button type="button" className="btn btn-danger-outline" onClick={() => setRevokeAll(true)}>
            Cerrar todas las sesiones
          </button>
        }
      />
      {revokeAll && (
        <ReauthDialog
          title="Cerrar todas las sesiones"
          confirmLabel="Cerrar sesiones"
          onClose={() => setRevokeAll(false)}
          onConfirm={async (password) => {
            const result = await api.post<{ revokedSessions: number }>('/admin/sessions/revoke-all', { password });
            setRevokeAll(false);
            setMessage(`Se han cerrado ${result.revokedSessions} sesiones en toda la plataforma (salvo la tuya).`);
          }}
        >
          <p className="muted">Medida de respuesta ante incidentes: todos los usuarios deberán volver a iniciar sesión. Quedará registrado en la auditoría y generará una alerta.</p>
        </ReauthDialog>
      )}
      {message && (
        <Notice kind="success" onClose={() => setMessage(null)}>
          {message}
        </Notice>
      )}
      <ErrorNotice error={error} onClose={() => setError(null)} />
      <section className="card filters">
        <input
          placeholder="Buscar por correo o nombre"
          maxLength={100}
          value={q}
          onChange={(event) => {
            setQ(event.target.value);
            setPage(1);
          }}
          aria-label="Buscar usuarios"
        />
      </section>
      <section className="card table-card">
        {!data ? (
          error ? <p className="muted">No se han podido cargar los datos.</p> : <Spinner />
        ) : (
          <>
            <div className="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>Usuario</th>
                    <th>Rol</th>
                    <th>Estado</th>
                    <th>MFA</th>
                    <th>Último acceso</th>
                    <th aria-label="Acciones" />
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((user) => {
                    const self = user.id === me?.id;
                    const locked = user.lockedUntil && new Date(user.lockedUntil) > new Date();
                    return (
                      <tr key={user.id}>
                        <td>
                          <strong>{user.name}</strong>
                          <span className="cell-sub">{user.email}</span>
                        </td>
                        <td>
                          <select
                            value={user.role}
                            disabled={self}
                            aria-label={`Rol de ${user.email}`}
                            onChange={(event) => act(() => api.patch(`/admin/users/${user.id}`, { role: event.target.value as Role }), 'Rol actualizado. Las sesiones del usuario se han cerrado.')}
                          >
                            {Object.entries(ROLE_LABELS).map(([value, label]) => (
                              <option key={value} value={value}>
                                {label}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td>
                          {user.status === 'DISABLED' ? <Badge tone="danger">Deshabilitada</Badge> : locked ? <Badge tone="warning">Bloqueada</Badge> : <Badge tone="success">Activa</Badge>}
                        </td>
                        <td>{user.mfaEnabled ? <Badge tone="success">Sí</Badge> : <Badge>No</Badge>}</td>
                        <td className="nowrap">{user.lastLoginAt ? formatDateTime(user.lastLoginAt) : '—'}</td>
                        <td className="row-actions">
                          {self ? (
                            <span className="muted">Tu cuenta</span>
                          ) : (
                            <>
                              {locked && (
                                <button type="button" className="btn btn-sm btn-ghost" onClick={() => act(() => api.post(`/admin/users/${user.id}/unlock`), 'Cuenta desbloqueada.')}>
                                  Desbloquear
                                </button>
                              )}
                              <button
                                type="button"
                                className="btn btn-sm btn-ghost"
                                onClick={() =>
                                  act(async () => {
                                    const result = await api.post<{ revokedSessions: number }>(`/admin/users/${user.id}/revoke-sessions`);
                                    setMessage(`Sesiones cerradas: ${result.revokedSessions}.`);
                                  }, 'Sesiones cerradas.')
                                }
                              >
                                Cerrar sesiones
                              </button>
                              {user.mfaEnabled && (
                                <button
                                  type="button"
                                  className="btn btn-sm btn-ghost"
                                  onClick={() => window.confirm(`¿Reiniciar el segundo factor de ${user.email}?`) && act(() => api.post(`/admin/users/${user.id}/reset-mfa`), 'Segundo factor reiniciado.')}
                                >
                                  Reiniciar MFA
                                </button>
                              )}
                              <button
                                type="button"
                                className={`btn btn-sm ${user.status === 'ACTIVE' ? 'btn-danger-outline' : 'btn-secondary'}`}
                                onClick={() =>
                                  act(
                                    () => api.patch(`/admin/users/${user.id}`, { status: user.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE' }),
                                    user.status === 'ACTIVE' ? 'Cuenta deshabilitada.' : 'Cuenta habilitada.',
                                  )
                                }
                              >
                                {user.status === 'ACTIVE' ? 'Deshabilitar' : 'Habilitar'}
                              </button>
                            </>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onChange={setPage} />
          </>
        )}
      </section>
    </>
  );
}

// --- Auditoría -------------------------------------------------------------------------------

export function AuditPage() {
  const [page, setPage] = useState(1);
  const [action, setAction] = useState('');
  const [outcome, setOutcome] = useState('');
  const [data, setData] = useState<Paginated<AuditEntry> | null>(null);
  const [verification, setVerification] = useState<ChainVerification | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const load = useCallback(async () => {
    try {
      setData(await api.get<Paginated<AuditEntry>>('/audit/logs', { page, action, outcome, pageSize: 25 }));
    } catch (caught) {
      setError(caught);
    }
  }, [page, action, outcome]);

  useEffect(() => {
    void load();
  }, [load]);

  const verify = async () => {
    setVerifying(true);
    setError(null);
    try {
      setVerification(await api.get<ChainVerification>('/audit/verify'));
      await load();
    } catch (caught) {
      setError(caught);
    } finally {
      setVerifying(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Registro de auditoría"
        subtitle="Eventos de seguridad encadenados con HMAC-SHA256 para detectar cualquier manipulación."
        actions={
          <button type="button" className="btn btn-primary" onClick={verify} disabled={verifying}>
            <ShieldIcon /> {verifying ? 'Verificando…' : 'Verificar integridad'}
          </button>
        }
      />
      <ErrorNotice error={error} onClose={() => setError(null)} />
      {verification &&
        (verification.valid ? (
          <Notice kind="success">
            <strong>Cadena íntegra.</strong> Se han verificado {verification.checked} entradas sin encontrar alteraciones.
          </Notice>
        ) : (
          <Notice kind="error">
            <strong>¡Cadena rota en la entrada #{verification.brokenAtId}!</strong> {verification.reason} Se ha generado una alerta crítica.
          </Notice>
        ))}
      <section className="card filters">
        <select
          value={action}
          onChange={(event) => {
            setAction(event.target.value);
            setPage(1);
          }}
          aria-label="Tipo de evento"
        >
          <option value="">Todos los eventos</option>
          {Object.entries(ACTION_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <select
          value={outcome}
          onChange={(event) => {
            setOutcome(event.target.value);
            setPage(1);
          }}
          aria-label="Resultado"
        >
          <option value="">Todos los resultados</option>
          {Object.entries(OUTCOME_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </section>
      <section className="card table-card">
        {!data ? (
          error ? <p className="muted">No se han podido cargar los datos.</p> : <Spinner />
        ) : (
          <>
            <div className="table-wrapper">
              <table className="table-dense">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Fecha</th>
                    <th>Evento</th>
                    <th>Resultado</th>
                    <th>Actor</th>
                    <th>IP</th>
                    <th>Hash (HMAC)</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((entry) => (
                    <tr key={entry.id}>
                      <td className="mono">{entry.id}</td>
                      <td className="nowrap">{formatDateTime(entry.createdAt)}</td>
                      <td>
                        {ACTION_LABELS[entry.action] ?? entry.action}
                        {entry.details && <span className="cell-sub mono">{entry.details.slice(0, 80)}</span>}
                      </td>
                      <td>
                        <Badge tone={entry.outcome === 'SUCCESS' ? 'success' : entry.outcome === 'DENIED' ? 'danger' : 'warning'}>{OUTCOME_LABELS[entry.outcome]}</Badge>
                      </td>
                      <td>{entry.actorEmail ?? '—'}</td>
                      <td className="mono">{entry.ip ?? '—'}</td>
                      <td className="mono" title={entry.hash}>
                        {entry.hash.slice(0, 12)}…
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onChange={setPage} />
          </>
        )}
      </section>
    </>
  );
}

// --- Alertas ---------------------------------------------------------------------------------

const SEVERITY_TONE = { LOW: 'info', MEDIUM: 'warning', HIGH: 'danger', CRITICAL: 'danger' } as const;
const SEVERITY_LABEL = { LOW: 'Baja', MEDIUM: 'Media', HIGH: 'Alta', CRITICAL: 'Crítica' } as const;

export function AlertsPage() {
  const { user } = useAuth();
  const [status, setStatus] = useState<'open' | 'all'>('open');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Paginated<SecurityAlert> | null>(null);
  const [error, setError] = useState<unknown>(null);

  const load = useCallback(async () => {
    try {
      setData(await api.get<Paginated<SecurityAlert>>('/audit/alerts', { status, page, pageSize: 20 }));
    } catch (caught) {
      setError(caught);
    }
  }, [status, page]);

  useEffect(() => {
    void load();
  }, [load]);

  const acknowledge = async (id: string) => {
    try {
      await api.post(`/audit/alerts/${id}/ack`);
      await load();
    } catch (caught) {
      setError(caught);
    }
  };

  return (
    <>
      <PageHeader
        title="Alertas de seguridad"
        subtitle="Detecciones automáticas: fuerza bruta, bloqueos, robo de sesión, sondeo de permisos y manipulación de la auditoría."
        actions={
          <select
            value={status}
            onChange={(event) => {
              setStatus(event.target.value as 'open' | 'all');
              setPage(1);
            }}
            aria-label="Estado"
          >
            <option value="open">Pendientes</option>
            <option value="all">Todas</option>
          </select>
        }
      />
      <ErrorNotice error={error} onClose={() => setError(null)} />
      {!data ? (
        error ? <p className="muted">No se han podido cargar los datos.</p> : <Spinner />
      ) : data.items.length === 0 ? (
        <section className="card">
          <EmptyState title="No hay alertas pendientes">Las nuevas detecciones aparecerán aquí.</EmptyState>
        </section>
      ) : (
        <>
          <ul className="alert-list">
            {data.items.map((alert) => (
              <li key={alert.id} className={`card alert-item severity-${alert.severity.toLowerCase()}`}>
                <div className="alert-head">
                  <Badge tone={SEVERITY_TONE[alert.severity]}>{SEVERITY_LABEL[alert.severity]}</Badge>
                  <strong>{ALERT_LABELS[alert.type] ?? alert.type}</strong>
                  <span className="muted">{formatDateTime(alert.createdAt)}</span>
                </div>
                <p>{alert.message}</p>
                <div className="alert-foot">
                  <span className="muted mono">{alert.ip ? `IP ${alert.ip}` : ''}</span>
                  {alert.acknowledgedAt ? (
                    <span className="muted">
                      <CheckIcon size={14} /> Revisada por {alert.acknowledgedBy} · {formatDateTime(alert.acknowledgedAt)}
                    </span>
                  ) : (
                    user?.role === 'ADMIN' && (
                      <button type="button" className="btn btn-sm btn-secondary" onClick={() => acknowledge(alert.id)}>
                        Marcar como revisada
                      </button>
                    )
                  )}
                </div>
              </li>
            ))}
          </ul>
          <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onChange={setPage} />
        </>
      )}
    </>
  );
}
