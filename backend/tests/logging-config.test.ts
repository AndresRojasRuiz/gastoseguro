/**
 * A02:2025 - Security Misconfiguration, A08:2025 - Integrity y A09:2025 - Logging & Alerting.
 */
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { prisma } from '../src/lib/prisma.js';
import { flushAudit, verifyAuditChain } from '../src/services/audit.service.js';
import { app, auth, createUser } from './helpers.js';

describe('Cabeceras de seguridad', () => {
  it('envía una CSP estricta y el resto de cabeceras defensivas', async () => {
    const response = await request(app).get('/api/health');
    const csp = response.headers['content-security-policy'] ?? '';
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("script-src 'self'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).not.toContain('unsafe-inline');
    expect(csp).not.toContain('unsafe-eval');
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['x-frame-options']).toBe('DENY');
    expect(response.headers['referrer-policy']).toBe('no-referrer');
    expect(response.headers['cross-origin-opener-policy']).toBe('same-origin');
    expect(response.headers['permissions-policy']).toContain('camera=()');
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('no revela la tecnología del servidor', async () => {
    const response = await request(app).get('/api/health');
    expect(response.headers['x-powered-by']).toBeUndefined();
    expect(response.headers.server).toBeUndefined();
  });

  it('CORS solo autoriza los orígenes de la lista blanca', async () => {
    const allowed = await request(app).options('/api/expenses').set('Origin', 'http://localhost:5173').set('Access-Control-Request-Method', 'GET');
    expect(allowed.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    const denied = await request(app).options('/api/expenses').set('Origin', 'https://evil.example').set('Access-Control-Request-Method', 'GET');
    expect(denied.headers['access-control-allow-origin']).toBeUndefined();
  });
});

describe('Registro de auditoría encadenado', () => {
  it('la cadena es íntegra tras la actividad normal', async () => {
    await createUser();
    await flushAudit();
    const result = await verifyAuditChain();
    expect(result.valid).toBe(true);
    expect(result.checked).toBeGreaterThan(0);
  });

  it('detecta la modificación de una entrada y genera una alerta crítica', async () => {
    const auditor = await createUser('AUDITOR');
    await flushAudit();
    const target = await prisma.auditLog.findFirstOrThrow({ where: { action: 'AUTH_LOGIN', outcome: 'SUCCESS' }, orderBy: { id: 'asc' } });
    // Un atacante con acceso a la base de datos intenta ocultar su rastro.
    await prisma.auditLog.update({ where: { id: target.id }, data: { ip: '10.0.0.66' } });

    const response = await request(app).get('/api/audit/verify').set(auth(auditor));
    expect(response.status).toBe(200);
    expect(response.body.valid).toBe(false);
    expect(response.body.brokenAtId).toBe(target.id);
    expect(await prisma.securityAlert.count({ where: { type: 'AUDIT_TAMPERING' } })).toBeGreaterThanOrEqual(1);

    await prisma.auditLog.update({ where: { id: target.id }, data: { ip: target.ip } });
  });

  it('detecta el borrado de una entrada intermedia', async () => {
    await createUser();
    await flushAudit();
    const entries = await prisma.auditLog.findMany({ orderBy: { id: 'desc' }, take: 3 });
    const middle = entries[1]!;
    const backup = { ...middle };
    await prisma.auditLog.delete({ where: { id: middle.id } });
    const result = await verifyAuditChain();
    expect(result.valid).toBe(false);
    await prisma.auditLog.create({ data: backup });
    expect((await verifyAuditChain()).valid).toBe(true);
  });

  it('no registra secretos en la auditoría', async () => {
    const user = await createUser();
    await flushAudit();
    const entries = await prisma.auditLog.findMany({ where: { userId: user.id } });
    const serialized = JSON.stringify(entries);
    expect(serialized).not.toContain(user.password);
    expect(serialized).not.toContain(user.token);
  });
});
