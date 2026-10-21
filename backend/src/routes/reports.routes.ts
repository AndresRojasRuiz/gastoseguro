import { Router } from 'express';
import { authenticate, requireAuth } from '../middleware/auth.js';
import { sensitiveActionLimiter } from '../middleware/rate-limit.js';
import { clientInfo } from '../middleware/request-context.js';
import { ExportQuerySchema, SummaryQuerySchema } from '../schemas/index.js';
import * as reportService from '../services/report.service.js';

export const reportsRouter = Router();
reportsRouter.use(authenticate);

reportsRouter.get('/summary', async (req, res) => {
  const { month } = SummaryQuerySchema.parse(req.query);
  res.json(await reportService.getSummary(requireAuth(req), month));
});

reportsRouter.get('/export.csv', sensitiveActionLimiter, async (req, res) => {
  const query = ExportQuerySchema.parse(req.query);
  const csv = await reportService.exportCsv(requireAuth(req), query, clientInfo(req));
  const fileName = `gastos_${new Date().toISOString().slice(0, 10)}.csv`;
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.send(csv);
});
