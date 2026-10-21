import { useState, type FormEvent, type ReactNode } from 'react';
import { ErrorNotice, Modal } from './ui';

/**
 * Diálogo de reautenticación con la contraseña para acciones sensibles (cerrar sesiones,
 * operaciones de administración), conforme a OWASP ASVS 5.0, requisito 7.5.2.
 */
export function ReauthDialog({
  title,
  children,
  confirmLabel,
  onConfirm,
  onClose,
}: {
  title: string;
  children?: ReactNode;
  confirmLabel: string;
  onConfirm: (password: string) => Promise<void>;
  onClose: () => void;
}) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await onConfirm(password);
    } catch (caught) {
      setError(caught);
      setPassword('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={title} onClose={onClose} width={460}>
      <form onSubmit={submit}>
        {children}
        <ErrorNotice error={error} />
        <label className="field">
          <span>Confirma con tu contraseña</span>
          <input type="password" autoComplete="current-password" required maxLength={256} value={password} onChange={(event) => setPassword(event.target.value)} />
        </label>
        <div className="form-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" className="btn btn-danger-outline" disabled={busy || password.length === 0}>
            {busy ? 'Comprobando…' : confirmLabel}
          </button>
        </div>
      </form>
    </Modal>
  );
}
