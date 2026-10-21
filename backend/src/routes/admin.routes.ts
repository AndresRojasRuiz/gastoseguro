/**
 * Rutas de administración (rol ADMIN) y auditoría (roles ADMIN y AUDITOR).
 * La autorización se aplica en el servidor a nivel de router: la interfaz de usuario
 * solo oculta opciones, nunca es el control de seguridad.
 */
import { Router } from 'express';
import { authenticate, requireAuth, requireRole } from '../middleware/auth.js';
import { sensitiveActionLimiter } from '../middleware/rate-limit.js';
import { clientInfo } from '../middleware/request-context.js';
import { uuidParam } from '../schemas/common.js';
import { AdminUserQuerySchema, AdminUserUpdateSchema, AlertQuerySchema, AuditQuerySchema, ReauthSchema } from '../schemas/index.js';
import * as adminService from '../services/admin.service.js';

export const adminRouter = Router();
adminRouter.use(authenticate, requireRole('ADMIN'));

adminRouter.get('/users', async (req, res) => {
  const query = AdminUserQuerySchema.parse(req.query);
  res.json(await adminService.listUsers(query));
});

adminRouter.patch('/users/:id', async (req, res) => {
  const { id } = uuidParam.parse(req.params);
  const input = AdminUserUpdateSchema.parse(req.body);
  res.json(await adminService.updateUser(requireAuth(req), id, input, clientInfo(req)));
});

adminRouter.post('/users/:id/unlock', async (req, res) => {
  const { id } = uuidParam.parse(req.params);
  res.json(await adminService.unlockUser(requireAuth(req), id, clientInfo(req)));
});

adminRouter.post('/users/:id/reset-mfa', async (req, res) => {
  const { id } = uuidParam.parse(req.params);
  res.json(await adminService.resetUserMfa(requireAuth(req), id, clientInfo(req)));
});

adminRouter.post('/users/:id/revoke-sessions', async (req, res) => {
  const { id } = uuidParam.parse(req.params);
  res.json(await adminService.revokeSessionsOfUser(requireAuth(req), id, clientInfo(req)));
});

adminRouter.post('/sessions/revoke-all', sensitiveActionLimiter, async (req, res) => {
  const { password } = ReauthSchema.parse(req.body);
  res.json(await adminService.revokeAllSessions(requireAuth(req), password, clientInfo(req)));
});

export const auditRouter = Router();
auditRouter.use(authenticate, requireRole('ADMIN', 'AUDITOR'));

auditRouter.get('/logs', async (req, res) => {
  const query = AuditQuerySchema.parse(req.query);
  res.json(await adminService.listAuditLogs(query));
});

auditRouter.get('/verify', async (req, res) => {
  res.json(await adminService.verifyChain(requireAuth(req), clientInfo(req)));
});

auditRouter.get('/alerts', async (req, res) => {
  const query = AlertQuerySchema.parse(req.query);
  res.json(await adminService.listAlerts(query));
});

auditRouter.post('/alerts/:id/ack', requireRole('ADMIN'), async (req, res) => {
  const { id } = uuidParam.parse(req.params);
  await adminService.acknowledgeAlert(requireAuth(req), id, clientInfo(req));
  res.status(204).end();
});
