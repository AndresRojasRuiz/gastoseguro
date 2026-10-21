import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { api } from '../api/client';
import type { ActivityEntry, Currency, SessionInfo, User } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { DeviceIcon, KeyIcon, LockIcon, ShieldIcon } from '../components/Icons';
import { PasswordStrength } from '../components/PasswordStrength';
import { QrCode } from '../components/QrCode';
import { ReauthDialog } from '../components/ReauthDialog';
import { Badge, ErrorNotice, Notice, PageHeader, Spinner } from '../components/ui';
import { ACTION_LABELS, describeUserAgent, formatDateTime, OUTCOME_LABELS } from '../lib/format';

function ProfileCard() {
  const { user, setUser } = useAuth();
  const [name, setName] = useState(user?.name ?? '');
  const [currency, setCurrency] = useState<Currency>(user?.currency ?? 'EUR');
  const [error, setError] = useState<unknown>(null);
  const [saved, setSaved] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setSaved(false);
    try {
      setUser(await api.patch<User>('/account/me', { name, currency }));
      setSaved(true);
    } catch (caught) {
      setError(caught);
    }
  };

  return (
    <form className="card" onSubmit={submit}>
      <header className="card-header">
        <h2>Perfil</h2>
      </header>
      <ErrorNotice error={error} />
      {saved && <Notice kind="success">Perfil actualizado.</Notice>}
      <label className="field">
        <span>Correo electrónico</span>
        <input value={user?.email ?? ''} disabled />
      </label>
      <label className="field">
        <span>Nombre</span>
        <input required minLength={2} maxLength={80} value={name} onChange={(event) => setName(event.target.value)} />
      </label>
      <label className="field">
        <span>Moneda</span>
        <select value={currency} onChange={(event) => setCurrency(event.target.value as Currency)}>
          <option value="EUR">Euro (EUR)</option>
          <option value="USD">Dólar estadounidense (USD)</option>
          <option value="CLP">Peso chileno (CLP)</option>
        </select>
        <small className="hint">Solo puede cambiarse mientras no haya gastos registrados.</small>
      </label>
      <button type="submit" className="btn btn-secondary">
        Guardar cambios
      </button>
    </form>
  );
}

function PasswordCard({ onChanged }: { onChanged: () => void }) {
  const [form, setForm] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [error, setError] = useState<unknown>(null);
  const [message, setMessage] = useState<string | null>(null);
  const mismatch = form.confirm.length > 0 && form.confirm !== form.newPassword;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (mismatch) return;
    setError(null);
    setMessage(null);
    try {
      const result = await api.post<{ revokedSessions: number }>('/account/password', { currentPassword: form.currentPassword, newPassword: form.newPassword });
      setForm({ currentPassword: '', newPassword: '', confirm: '' });
      setMessage(`Contraseña actualizada. Se han cerrado ${result.revokedSessions} sesiones en otros dispositivos.`);
      onChanged();
    } catch (caught) {
      setError(caught);
    }
  };

  return (
    <form className="card" onSubmit={submit}>
      <header className="card-header">
        <h2>
          <LockIcon /> Cambiar contraseña
        </h2>
      </header>
      <ErrorNotice error={error} />
      {message && <Notice kind="success">{message}</Notice>}
      <label className="field">
        <span>Contraseña actual</span>
        <input type="password" autoComplete="current-password" required value={form.currentPassword} onChange={(event) => setForm({ ...form, currentPassword: event.target.value })} />
      </label>
      <label className="field">
        <span>Nueva contraseña</span>
        <input type="password" autoComplete="new-password" required minLength={15} maxLength={128} value={form.newPassword} onChange={(event) => setForm({ ...form, newPassword: event.target.value })} />
      </label>
      <PasswordStrength password={form.newPassword} />
      <label className="field">
        <span>Repite la nueva contraseña</span>
        <input type="password" autoComplete="new-password" required value={form.confirm} onChange={(event) => setForm({ ...form, confirm: event.target.value })} aria-invalid={mismatch} />
        {mismatch && <small className="field-error">Las contraseñas no coinciden.</small>}
      </label>
      <button type="submit" className="btn btn-secondary" disabled={mismatch}>
        Actualizar contraseña
      </button>
    </form>
  );
}

function MfaCard({ onChanged }: { onChanged: () => void }) {
  const { user, setUser } = useAuth();
  const [setup, setSetup] = useState<{ secret: string; otpauthUrl: string } | null>(null);
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [message, setMessage] = useState<string | null>(null);

  const refreshUser = async () => setUser(await api.get<User>('/account/me'));

  const start = async () => {
    setError(null);
    try {
      setSetup(await api.post('/account/mfa/setup'));
    } catch (caught) {
      setError(caught);
    }
  };

  const enable = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    try {
      await api.post('/account/mfa/enable', { code, password });
      setSetup(null);
      setCode('');
      setPassword('');
      setMessage('Verificación en dos pasos activada. Las demás sesiones se han cerrado.');
      await refreshUser();
      onChanged();
    } catch (caught) {
      setError(caught);
    }
  };

  const disable = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    try {
      await api.post('/account/mfa/disable', { password, code });
      setPassword('');
      setCode('');
      setMessage('Verificación en dos pasos desactivada.');
      await refreshUser();
    } catch (caught) {
      setError(caught);
    }
  };

  return (
    <section className="card">
      <header className="card-header">
        <h2>
          <KeyIcon /> Verificación en dos pasos (TOTP)
        </h2>
        {user?.mfaEnabled ? <Badge tone="success">Activada</Badge> : <Badge tone="warning">Desactivada</Badge>}
      </header>
      <ErrorNotice error={error} />
      {message && <Notice kind="success">{message}</Notice>}

      {!user?.mfaEnabled && !setup && (
        <>
          <p className="muted">Añade un segundo factor con una aplicación como Google Authenticator, Microsoft Authenticator o FreeOTP. Aunque alguien conozca tu contraseña, no podrá entrar sin tu dispositivo.</p>
          <button type="button" className="btn btn-primary" onClick={start}>
            <ShieldIcon /> Configurar
          </button>
        </>
      )}

      {setup && (
        <form onSubmit={enable} className="mfa-setup">
          <QrCode value={setup.otpauthUrl} />
          <div>
            <ol className="steps">
              <li>Escanea el código QR con tu aplicación de autenticación.</li>
              <li>
                Si no puedes escanearlo, introduce esta clave manualmente:
                <code className="secret">{setup.secret.match(/.{1,4}/g)?.join(' ')}</code>
              </li>
              <li>Escribe el código de 6 dígitos que aparece en la aplicación y confirma con tu contraseña.</li>
            </ol>
            <label className="field">
              <span>Contraseña actual</span>
              <input type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} />
            </label>
            <label className="field">
              <span>Código de verificación</span>
              <input className="otp-input" inputMode="numeric" autoComplete="one-time-code" maxLength={6} required value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))} />
            </label>
            <div className="form-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setSetup(null)}>
                Cancelar
              </button>
              <button type="submit" className="btn btn-primary" disabled={code.length !== 6 || password.length === 0}>
                Activar
              </button>
            </div>
          </div>
        </form>
      )}

      {user?.mfaEnabled && (
        <form onSubmit={disable}>
          <p className="muted">Para desactivar el segundo factor confirma tu identidad con la contraseña y un código actual.</p>
          <div className="form-grid">
            <label className="field">
              <span>Contraseña</span>
              <input type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} />
            </label>
            <label className="field">
              <span>Código TOTP</span>
              <input className="otp-input" inputMode="numeric" maxLength={6} required value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))} />
            </label>
          </div>
          <button type="submit" className="btn btn-danger-outline">
            Desactivar
          </button>
        </form>
      )}
    </section>
  );
}

function DeleteAccountCard() {
  const { user, forgetSession } = useAuth();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ password: '', code: '', confirm: '' });
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.post('/account/delete', { password: form.password, confirm: form.confirm, ...(user?.mfaEnabled ? { code: form.code } : {}) });
      // La ruta protegida redirige al inicio de sesión, que muestra la confirmación.
      forgetSession();
    } catch (caught) {
      setError(caught);
      setForm({ ...form, password: '', code: '' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card danger-zone">
      <header className="card-header">
        <h2>Eliminar la cuenta</h2>
      </header>
      {!open ? (
        <>
          <p className="muted">
            Elimina de forma definitiva tu cuenta, tus gastos, categorías y justificantes (derecho de supresión, RGPD art. 17). El registro de auditoría de seguridad se conserva
            durante su plazo, con tu identificador seudónimo, por interés legítimo en la seguridad del servicio.
          </p>
          <button type="button" className="btn btn-danger-outline" onClick={() => setOpen(true)}>
            Eliminar mi cuenta
          </button>
        </>
      ) : (
        <form onSubmit={submit}>
          <ErrorNotice error={error} />
          <Notice kind="warning">Esta acción no se puede deshacer. Exporta antes tus gastos en CSV si quieres conservarlos.</Notice>
          <div className="form-grid">
            <label className="field">
              <span>Contraseña</span>
              <input type="password" autoComplete="current-password" required value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} />
            </label>
            {user?.mfaEnabled && (
              <label className="field">
                <span>Código TOTP</span>
                <input className="otp-input" inputMode="numeric" maxLength={6} required value={form.code} onChange={(event) => setForm({ ...form, code: event.target.value.replace(/\D/g, '') })} />
              </label>
            )}
            <label className="field">
              <span>Escribe ELIMINAR para confirmar</span>
              <input required autoComplete="off" value={form.confirm} onChange={(event) => setForm({ ...form, confirm: event.target.value })} />
            </label>
          </div>
          <div className="form-actions">
            <button type="button" className="btn btn-ghost" onClick={() => setOpen(false)}>
              Cancelar
            </button>
            <button type="submit" className="btn btn-danger" disabled={busy || form.confirm !== 'ELIMINAR'}>
              {busy ? 'Eliminando…' : 'Eliminar definitivamente'}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}

export function SecurityPage() {
  const [sessions, setSessions] = useState<SessionInfo[] | null>(null);
  const [activity, setActivity] = useState<ActivityEntry[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [pending, setPending] = useState<{ kind: 'one'; id: string } | { kind: 'others' } | null>(null);

  const load = useCallback(async () => {
    try {
      const [sessionList, activityList] = await Promise.all([api.get<SessionInfo[]>('/account/sessions'), api.get<ActivityEntry[]>('/account/activity')]);
      setSessions(sessionList);
      setActivity(activityList);
    } catch (caught) {
      setError(caught);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Cerrar sesiones exige volver a introducir la contraseña (OWASP ASVS 5.0, 7.5.2).
  const confirmRevoke = async (password: string) => {
    if (!pending) return;
    if (pending.kind === 'one') await api.post(`/account/sessions/${pending.id}/revoke`, { password });
    else await api.post('/account/sessions/revoke-others', { password });
    setPending(null);
    await load();
  };

  return (
    <>
      <PageHeader title="Seguridad de la cuenta" subtitle="Gestiona tu perfil, contraseña, segundo factor y sesiones abiertas." />
      <ErrorNotice error={error} onClose={() => setError(null)} />
      <section className="two-columns">
        <ProfileCard />
        <PasswordCard onChanged={load} />
      </section>
      <MfaCard onChanged={load} />

      <section className="card">
        <header className="card-header">
          <h2>
            <DeviceIcon /> Sesiones activas
          </h2>
          <button type="button" className="btn btn-sm btn-ghost" onClick={() => setPending({ kind: 'others' })} disabled={!sessions || sessions.length <= 1}>
            Cerrar las demás sesiones
          </button>
        </header>
        {!sessions ? (
          <Spinner />
        ) : (
          <ul className="list">
            {sessions.map((session) => (
              <li key={session.id} className="list-row">
                <div className="list-main">
                  <strong>{describeUserAgent(session.userAgent)}</strong>
                  <span className="muted">
                    IP {session.ip ?? 'desconocida'} · último uso {formatDateTime(session.lastUsedAt)} · caduca {formatDateTime(session.expiresAt)}
                  </span>
                </div>
                {session.current ? (
                  <Badge tone="accent">Esta sesión</Badge>
                ) : (
                  <button type="button" className="btn btn-sm btn-danger-outline" onClick={() => setPending({ kind: 'one', id: session.id })}>
                    Cerrar
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
      {pending && (
        <ReauthDialog title={pending.kind === 'one' ? 'Cerrar sesión' : 'Cerrar las demás sesiones'} confirmLabel="Cerrar" onConfirm={confirmRevoke} onClose={() => setPending(null)}>
          <p className="muted">Por seguridad, confirma tu identidad antes de cerrar {pending.kind === 'one' ? 'esta sesión' : 'todas las sesiones salvo la actual'}.</p>
        </ReauthDialog>
      )}

      <section className="card">
        <header className="card-header">
          <h2>Actividad reciente de la cuenta</h2>
        </header>
        {!activity ? (
          <Spinner />
        ) : (
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Evento</th>
                  <th>Resultado</th>
                  <th>IP</th>
                  <th>Dispositivo</th>
                </tr>
              </thead>
              <tbody>
                {activity.map((entry) => (
                  <tr key={entry.id}>
                    <td className="nowrap">{formatDateTime(entry.createdAt)}</td>
                    <td>{ACTION_LABELS[entry.action] ?? entry.action}</td>
                    <td>
                      <Badge tone={entry.outcome === 'SUCCESS' ? 'success' : entry.outcome === 'DENIED' ? 'danger' : 'warning'}>{OUTCOME_LABELS[entry.outcome]}</Badge>
                    </td>
                    <td className="mono">{entry.ip ?? '—'}</td>
                    <td>{describeUserAgent(entry.userAgent)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <DeleteAccountCard />
    </>
  );
}
