import { useEffect, useId, useRef, type ReactNode } from 'react';
import { ApiError } from '../api/client';
import { AlertIcon, CheckIcon, CloseIcon } from './Icons';

export function Notice({ kind, children, onClose }: { kind: 'error' | 'success' | 'info' | 'warning'; children: ReactNode; onClose?: () => void }) {
  return (
    <div className={`notice notice-${kind}`} role={kind === 'error' ? 'alert' : 'status'}>
      <span className="notice-icon">{kind === 'success' ? <CheckIcon /> : <AlertIcon />}</span>
      <div className="notice-body">{children}</div>
      {onClose && (
        <button type="button" className="icon-button" onClick={onClose} aria-label="Cerrar aviso">
          <CloseIcon size={16} />
        </button>
      )}
    </div>
  );
}

/** Muestra un error de la API con sus detalles de validación y el identificador de petición. */
export function ErrorNotice({ error, onClose }: { error: unknown; onClose?: () => void }) {
  if (!error) return null;
  const apiError = error instanceof ApiError ? error : null;
  return (
    <Notice kind="error" onClose={onClose}>
      <strong>{apiError?.message ?? 'No se pudo completar la operación.'}</strong>
      {apiError?.details && apiError.details.length > 0 && (
        <ul>
          {apiError.details.map((detail, index) => (
            <li key={index}>{detail.message}</li>
          ))}
        </ul>
      )}
      {apiError?.requestId && <small className="muted">Referencia: {apiError.requestId}</small>}
    </Notice>
  );
}

export function Spinner({ label = 'Cargando…' }: { label?: string }) {
  return (
    <div className="spinner" role="status">
      <span className="spinner-dot" aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}

export function Modal({ title, onClose, children, width = 560 }: { title: string; onClose: () => void; children: ReactNode; width?: number }) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    dialogRef.current?.querySelector<HTMLElement>('input, select, textarea, button')?.focus();
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      previous?.focus();
    };
  }, [onClose]);
  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby={titleId} ref={dialogRef} style={{ maxWidth: width }}>
        <header className="modal-header">
          <h2 id={titleId}>{title}</h2>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Cerrar">
            <CloseIcon />
          </button>
        </header>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

export function Pagination({ page, pageSize, total, onChange }: { page: number; pageSize: number; total: number; onChange: (page: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <nav className="pagination" aria-label="Paginación">
      <span className="muted">
        {total === 0 ? 'Sin resultados' : `${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, total)} de ${total}`}
      </span>
      <div className="pagination-buttons">
        <button type="button" className="btn btn-ghost btn-sm" disabled={page <= 1} onClick={() => onChange(page - 1)}>
          Anterior
        </button>
        <span className="pagination-page">
          {page} / {pages}
        </span>
        <button type="button" className="btn btn-ghost btn-sm" disabled={page >= pages} onClick={() => onChange(page + 1)}>
          Siguiente
        </button>
      </div>
    </nav>
  );
}

export function Badge({ tone = 'neutral', children }: { tone?: 'neutral' | 'success' | 'danger' | 'warning' | 'info' | 'accent'; children: ReactNode }) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

export function CategoryChip({ name, color }: { name: string; color: string }) {
  return (
    <span className="chip">
      <span className="chip-dot" style={{ backgroundColor: color }} aria-hidden="true" />
      {name}
    </span>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <header className="page-header">
      <div>
        <h1>{title}</h1>
        {subtitle && <p className="muted">{subtitle}</p>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </header>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="empty-state">
      <strong>{title}</strong>
      {children && <p className="muted">{children}</p>}
    </div>
  );
}
