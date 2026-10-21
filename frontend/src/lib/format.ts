import type { Currency, PaymentMethod } from '../api/types';

const moneyFormatters = new Map<Currency, Intl.NumberFormat>();

export function formatMoney(amount: string | number, currency: Currency): string {
  let formatter = moneyFormatters.get(currency);
  if (!formatter) {
    formatter = new Intl.NumberFormat('es-ES', { style: 'currency', currency, minimumFractionDigits: currency === 'CLP' ? 0 : 2 });
    moneyFormatters.set(currency, formatter);
  }
  return formatter.format(typeof amount === 'number' ? amount : Number(amount));
}

export const minorToMajor = (minor: number, currency: Currency) => (currency === 'CLP' ? minor : minor / 100);

export function formatDate(value: string): string {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00`) : new Date(value);
  return date.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function formatDateTime(value: string): string {
  return new Date(value).toLocaleString('es-ES', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function formatMonth(value: string, style: 'short' | 'long' = 'short'): string {
  const [year, month] = value.split('-').map(Number);
  return new Date(year ?? 2000, (month ?? 1) - 1, 1).toLocaleDateString('es-ES', { month: style, ...(style === 'long' ? { year: 'numeric' } : {}) });
}

export const todayIso = () => {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
};

export const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  CASH: 'Efectivo',
  CARD: 'Tarjeta',
  TRANSFER: 'Transferencia',
  OTHER: 'Otro',
};

export const ROLE_LABELS: Record<string, string> = { USER: 'Usuario', AUDITOR: 'Auditor', ADMIN: 'Administrador' };

export const ACTION_LABELS: Record<string, string> = {
  AUTH_REGISTER: 'Registro de cuenta',
  AUTH_LOGIN: 'Inicio de sesión',
  AUTH_LOGIN_MFA: 'Verificación MFA',
  AUTH_LOGOUT: 'Cierre de sesión',
  AUTH_REFRESH: 'Renovación de sesión',
  AUTH_TOKEN_REUSE: 'Reutilización de token',
  AUTH_ACCOUNT_LOCKED: 'Cuenta bloqueada',
  AUTH_SESSION_REVOKED: 'Sesión revocada',
  ACCOUNT_PASSWORD_CHANGE: 'Cambio de contraseña',
  ACCOUNT_PROFILE_UPDATE: 'Actualización de perfil',
  ACCOUNT_MFA_ENABLE: 'Activación de MFA',
  ACCOUNT_MFA_DISABLE: 'Desactivación de MFA',
  ACCOUNT_DELETE: 'Supresión de cuenta',
  ACCESS_DENIED: 'Acceso denegado',
  RATE_LIMIT_EXCEEDED: 'Límite de peticiones',
  CATEGORY_CREATE: 'Categoría creada',
  CATEGORY_UPDATE: 'Categoría modificada',
  CATEGORY_DELETE: 'Categoría eliminada',
  EXPENSE_CREATE: 'Gasto creado',
  EXPENSE_UPDATE: 'Gasto modificado',
  EXPENSE_DELETE: 'Gasto eliminado',
  RECEIPT_UPLOAD: 'Justificante subido',
  RECEIPT_DOWNLOAD: 'Justificante descargado',
  RECEIPT_DELETE: 'Justificante eliminado',
  RECEIPT_REJECTED: 'Justificante rechazado',
  REPORT_EXPORT: 'Exportación CSV',
  ADMIN_USER_UPDATE: 'Cambio de usuario (admin)',
  ADMIN_USER_UNLOCK: 'Desbloqueo de usuario',
  ADMIN_MFA_RESET: 'Reinicio de MFA (admin)',
  ADMIN_SESSIONS_REVOKED: 'Cierre de sesiones (admin)',
  AUDIT_VERIFY: 'Verificación de auditoría',
  ALERT_RAISED: 'Alerta generada',
  ALERT_ACKNOWLEDGED: 'Alerta revisada',
  DATA_RETENTION_PURGE: 'Purga por conservación',
};

export const OUTCOME_LABELS: Record<string, string> = { SUCCESS: 'Correcto', FAILURE: 'Fallido', DENIED: 'Denegado' };

export const ALERT_LABELS: Record<string, string> = {
  BRUTE_FORCE_IP: 'Fuerza bruta desde IP',
  ACCOUNT_LOCKED: 'Cuenta bloqueada',
  TOKEN_REUSE: 'Reutilización de token',
  ACCESS_CONTROL_PROBING: 'Sondeo de permisos (IDOR)',
  PRIVILEGE_CHANGE: 'Cambio de privilegios',
  AUDIT_TAMPERING: 'Manipulación de auditoría',
};

export function describeUserAgent(userAgent: string | null): string {
  if (!userAgent) return 'Dispositivo desconocido';
  const browser = /Edg\//.test(userAgent) ? 'Edge' : /Chrome\//.test(userAgent) ? 'Chrome' : /Firefox\//.test(userAgent) ? 'Firefox' : /Safari\//.test(userAgent) ? 'Safari' : 'Navegador';
  const os = /Windows/.test(userAgent) ? 'Windows' : /Mac OS X/.test(userAgent) ? 'macOS' : /Android/.test(userAgent) ? 'Android' : /iPhone|iPad/.test(userAgent) ? 'iOS' : /Linux/.test(userAgent) ? 'Linux' : 'Otro sistema';
  return `${browser} en ${os}`;
}
