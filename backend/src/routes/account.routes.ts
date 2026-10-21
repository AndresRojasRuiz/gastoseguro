import { Router } from 'express';
import { REFRESH_COOKIE, refreshCookieOptions } from './auth.routes.js';
import { authenticate, requireAuth } from '../middleware/auth.js';
import { sensitiveActionLimiter } from '../middleware/rate-limit.js';
import { clientInfo } from '../middleware/request-context.js';
import { uuidParam } from '../schemas/common.js';
import {
  ChangePasswordSchema,
  DeleteAccountSchema,
  MfaDisableSchema,
  MfaEnableSchema,
  ReauthSchema,
  UpdateProfileSchema,
} from '../schemas/index.js';
import * as accountService from '../services/account.service.js';

export const accountRouter = Router();
accountRouter.use(authenticate);

accountRouter.get('/me', async (req, res) => {
  res.json(await accountService.getProfile(requireAuth(req)));
});

accountRouter.patch('/me', async (req, res) => {
  const input = UpdateProfileSchema.parse(req.body);
  res.json(await accountService.updateProfile(requireAuth(req), input, clientInfo(req)));
});

accountRouter.post('/password', sensitiveActionLimiter, async (req, res) => {
  const input = ChangePasswordSchema.parse(req.body);
  res.json(await accountService.changePassword(requireAuth(req), input, clientInfo(req)));
});

accountRouter.post('/mfa/setup', sensitiveActionLimiter, async (req, res) => {
  res.json(await accountService.startMfaSetup(requireAuth(req)));
});

accountRouter.post('/mfa/enable', sensitiveActionLimiter, async (req, res) => {
  const { code, password } = MfaEnableSchema.parse(req.body);
  await accountService.enableMfa(requireAuth(req), code, password, clientInfo(req));
  res.status(204).end();
});

accountRouter.post('/mfa/disable', sensitiveActionLimiter, async (req, res) => {
  const input = MfaDisableSchema.parse(req.body);
  await accountService.disableMfa(requireAuth(req), input, clientInfo(req));
  res.status(204).end();
});

accountRouter.get('/sessions', async (req, res) => {
  res.json(await accountService.listSessions(requireAuth(req)));
});

accountRouter.post('/sessions/revoke-others', sensitiveActionLimiter, async (req, res) => {
  const { password } = ReauthSchema.parse(req.body);
  res.json(await accountService.revokeOtherSessions(requireAuth(req), password, clientInfo(req)));
});

accountRouter.post('/sessions/:id/revoke', sensitiveActionLimiter, async (req, res) => {
  const { id } = uuidParam.parse(req.params);
  const { password } = ReauthSchema.parse(req.body);
  await accountService.revokeSession(requireAuth(req), id, password, clientInfo(req));
  res.status(204).end();
});

accountRouter.post('/delete', sensitiveActionLimiter, async (req, res) => {
  const input = DeleteAccountSchema.parse(req.body);
  await accountService.deleteAccount(requireAuth(req), input, clientInfo(req));
  res.clearCookie(REFRESH_COOKIE, refreshCookieOptions());
  res.status(204).end();
});

accountRouter.get('/activity', async (req, res) => {
  res.json(await accountService.listOwnActivity(requireAuth(req)));
});
