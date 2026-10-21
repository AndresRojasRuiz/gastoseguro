/**
 * Detección y alerta de eventos de seguridad (A09:2025 - Security Logging & Alerting).
 *
 * Reglas implementadas:
 *  - BRUTE_FORCE_IP: 20 o más inicios de sesión fallidos desde una IP en 15 minutos
 *    (relleno de credenciales / credential stuffing).
 *  - ACCOUNT_LOCKED: una cuenta supera el umbral de intentos fallidos.
 *  - TOKEN_REUSE: reutilización de un refresh token ya rotado (indicio de robo de sesión).
 *  - ACCESS_CONTROL_PROBING: 10 o más accesos denegados de un usuario en 10 minutos
 *    (posible enumeración de identificadores / IDOR).
 *  - PRIVILEGE_CHANGE: cambio de rol o estado de una cuenta por un administrador.
 *  - AUDIT_TAMPERING: la verificación de la cadena de auditoría ha fallado.
 *
 * Las alertas se deduplican (misma regla y sujeto en 15 minutos), se persisten para el
 * panel de seguridad y se emiten en el log con nivel "warn"/"error" y la marca alert=true
 * para su reenvío a un SIEM.
 */
import { logger } from '../lib/logger.js';
import { prisma } from '../lib/prisma.js';
import { audit } from './audit.service.js';

export type AlertType =
  | 'BRUTE_FORCE_IP'
  | 'ACCOUNT_LOCKED'
  | 'TOKEN_REUSE'
  | 'ACCESS_CONTROL_PROBING'
  | 'PRIVILEGE_CHANGE'
  | 'AUDIT_TAMPERING';

export type AlertSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

interface AlertInput {
  type: AlertType;
  severity: AlertSeverity;
  message: string;
  userId?: string | null;
  ip?: string | null;
  details?: Record<string, unknown>;
}

const DEDUP_WINDOW_MS = 15 * 60 * 1000;

export async function raiseAlert(input: AlertInput): Promise<void> {
  try {
    const recent = await prisma.securityAlert.findFirst({
      where: {
        type: input.type,
        userId: input.userId ?? null,
        ip: input.ip ?? null,
        createdAt: { gte: new Date(Date.now() - DEDUP_WINDOW_MS) },
      },
    });
    if (recent) return;

    const alert = await prisma.securityAlert.create({
      data: {
        type: input.type,
        severity: input.severity,
        message: input.message,
        userId: input.userId ?? null,
        ip: input.ip ?? null,
        details: input.details ? JSON.stringify(input.details).slice(0, 2000) : null,
      },
    });
    const level = input.severity === 'HIGH' || input.severity === 'CRITICAL' ? 'error' : 'warn';
    logger[level]({ alert: true, alertId: alert.id, type: input.type, severity: input.severity, userId: input.userId, ip: input.ip }, input.message);
    await audit({
      action: 'ALERT_RAISED',
      outcome: 'SUCCESS',
      userId: input.userId ?? null,
      targetType: 'SecurityAlert',
      targetId: alert.id,
      details: { type: input.type, severity: input.severity },
    });
  } catch (error) {
    // La alerta no debe interrumpir la petición, pero su fallo queda registrado.
    logger.error({ err: error, alert: input }, 'No se pudo registrar la alerta de seguridad');
  }
}

export async function detectBruteForceFromIp(ip: string | null): Promise<void> {
  if (!ip) return;
  const failures = await prisma.auditLog.count({
    where: { action: 'AUTH_LOGIN', outcome: { in: ['FAILURE', 'DENIED'] }, ip, createdAt: { gte: new Date(Date.now() - 15 * 60 * 1000) } },
  });
  if (failures >= 20) {
    await raiseAlert({
      type: 'BRUTE_FORCE_IP',
      severity: 'HIGH',
      message: `Posible ataque de fuerza bruta: ${failures} inicios de sesión fallidos desde la misma IP en 15 minutos.`,
      ip,
      details: { failures },
    });
  }
}

export async function detectAccessProbing(userId: string, ip: string | null): Promise<void> {
  const denied = await prisma.auditLog.count({
    where: { action: 'ACCESS_DENIED', userId, createdAt: { gte: new Date(Date.now() - 10 * 60 * 1000) } },
  });
  if (denied >= 10) {
    await raiseAlert({
      type: 'ACCESS_CONTROL_PROBING',
      severity: 'MEDIUM',
      message: `El usuario ha provocado ${denied} accesos denegados en 10 minutos (posible enumeración de recursos).`,
      userId,
      ip,
      details: { denied },
    });
  }
}
