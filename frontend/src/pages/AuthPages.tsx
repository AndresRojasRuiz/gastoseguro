import { useState, type FormEvent, type ReactNode } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router';
import { api } from '../api/client';
import type { Currency } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { CheckIcon, KeyIcon, LockIcon, ShieldIcon } from '../components/Icons';
import { Logo } from '../components/Layout';
import { PasswordStrength } from '../components/PasswordStrength';
import { ErrorNotice, Notice, Spinner } from '../components/ui';

function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="auth-page">
      <section className="auth-hero" aria-hidden="true">
        <Logo />
        <div>
          <h2>Tus gastos, bajo control y protegidos.</h2>
          <p>Aplicación desarrollada con seguridad por diseño siguiendo OWASP Top 10:2025 y OWASP ASVS 5.0.</p>
          <ul className="hero-list">
            <li>
              <ShieldIcon size={18} /> Contraseñas con Argon2id y segundo factor TOTP
            </li>
            <li>
              <LockIcon size={18} /> Sesiones revocables y tokens rotatorios
            </li>
            <li>
              <KeyIcon size={18} /> Auditoría encadenada y alertas de seguridad
            </li>
          </ul>
        </div>
        <small>TFE · Máster Universitario en Ciberseguridad · UNIR</small>
      </section>
      <section className="auth-panel">{children}</section>
    </div>
  );
}

export function LoginPage() {
  const { status, login, verifyMfa, sessionExpired, accountDeleted } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string; registered?: boolean } | null)?.from ?? '/';
  const registered = (location.state as { registered?: boolean } | null)?.registered;
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  if (status === 'loading') return <div className="center-screen"><Spinner /></div>;
  if (status === 'authenticated') return <Navigate to={from} replace />;

  const submitCredentials = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const challenge = await login(email, password);
      setPassword('');
      if (challenge) setChallengeId(challenge.challengeId);
      else navigate(from, { replace: true });
    } catch (caught) {
      setError(caught);
    } finally {
      setBusy(false);
    }
  };

  const submitCode = async (event: FormEvent) => {
    event.preventDefault();
    if (!challengeId) return;
    setBusy(true);
    setError(null);
    try {
      await verifyMfa(challengeId, code);
      navigate(from, { replace: true });
    } catch (caught) {
      setError(caught);
      setCode('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell>
      <div className="auth-card">
        {!challengeId ? (
          <form onSubmit={submitCredentials} noValidate={false}>
            <h1>Iniciar sesión</h1>
            <p className="muted">Accede a tu cuenta de GastoSeguro.</p>
            {sessionExpired && <Notice kind="warning">Tu sesión ha caducado. Vuelve a iniciar sesión.</Notice>}
            {registered && <Notice kind="success">Registro completado. Ya puedes iniciar sesión.</Notice>}
            {accountDeleted && <Notice kind="success">Tu cuenta y todos sus datos se han eliminado definitivamente.</Notice>}
            <ErrorNotice error={error} />
            <label className="field">
              <span>Correo electrónico</span>
              <input type="email" autoComplete="username" required maxLength={254} value={email} onChange={(event) => setEmail(event.target.value)} />
            </label>
            <label className="field">
              <span>Contraseña</span>
              <input type="password" autoComplete="current-password" required maxLength={256} value={password} onChange={(event) => setPassword(event.target.value)} />
            </label>
            <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
              {busy ? 'Comprobando…' : 'Entrar'}
            </button>
            <p className="auth-switch">
              ¿No tienes cuenta? <Link to="/registro">Crear una cuenta</Link>
            </p>
          </form>
        ) : (
          <form onSubmit={submitCode}>
            <div className="auth-badge">
              <KeyIcon size={22} />
            </div>
            <h1>Verificación en dos pasos</h1>
            <p className="muted">Introduce el código de 6 dígitos que muestra tu aplicación de autenticación.</p>
            <ErrorNotice error={error} />
            <label className="field">
              <span>Código de verificación</span>
              <input
                className="otp-input"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="\d{6}"
                maxLength={6}
                required
                value={code}
                onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))}
              />
            </label>
            <button type="submit" className="btn btn-primary btn-block" disabled={busy || code.length !== 6}>
              {busy ? 'Verificando…' : 'Verificar'}
            </button>
            <button type="button" className="btn btn-ghost btn-block" onClick={() => setChallengeId(null)}>
              Volver
            </button>
          </form>
        )}
      </div>
    </AuthShell>
  );
}

export function RegisterPage() {
  const { status } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', email: '', password: '', confirm: '', currency: 'EUR' as Currency });
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  if (status === 'authenticated') return <Navigate to="/" replace />;

  const mismatch = form.confirm.length > 0 && form.confirm !== form.password;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (mismatch) return;
    setBusy(true);
    setError(null);
    try {
      await api.post('/auth/register', { name: form.name, email: form.email, password: form.password, currency: form.currency });
      navigate('/login', { replace: true, state: { registered: true } });
    } catch (caught) {
      setError(caught);
    } finally {
      setBusy(false);
    }
  };

  const update = (field: keyof typeof form) => (event: { target: { value: string } }) => setForm((current) => ({ ...current, [field]: event.target.value }));

  return (
    <AuthShell>
      <div className="auth-card">
        <form onSubmit={submit}>
          <h1>Crear cuenta</h1>
          <p className="muted">Registra tus gastos de forma privada y segura.</p>
          <ErrorNotice error={error} />
          <label className="field">
            <span>Nombre</span>
            <input autoComplete="name" required minLength={2} maxLength={80} value={form.name} onChange={update('name')} />
          </label>
          <label className="field">
            <span>Correo electrónico</span>
            <input type="email" autoComplete="email" required maxLength={254} value={form.email} onChange={update('email')} />
          </label>
          <label className="field">
            <span>Contraseña</span>
            <input type="password" autoComplete="new-password" required minLength={15} maxLength={128} value={form.password} onChange={update('password')} />
          </label>
          <PasswordStrength password={form.password} />
          <label className="field">
            <span>Repite la contraseña</span>
            <input type="password" autoComplete="new-password" required value={form.confirm} onChange={update('confirm')} aria-invalid={mismatch} />
            {mismatch && <small className="field-error">Las contraseñas no coinciden.</small>}
          </label>
          <label className="field">
            <span>Moneda</span>
            <select value={form.currency} onChange={update('currency')}>
              <option value="EUR">Euro (EUR)</option>
              <option value="USD">Dólar estadounidense (USD)</option>
              <option value="CLP">Peso chileno (CLP)</option>
            </select>
          </label>
          <button type="submit" className="btn btn-primary btn-block" disabled={busy || mismatch}>
            {busy ? 'Creando cuenta…' : 'Crear cuenta'}
          </button>
          <p className="auth-switch">
            <CheckIcon size={14} /> ¿Ya tienes cuenta? <Link to="/login">Inicia sesión</Link>
          </p>
        </form>
      </div>
    </AuthShell>
  );
}
