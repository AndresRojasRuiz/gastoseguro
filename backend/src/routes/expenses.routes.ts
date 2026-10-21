import { Router } from 'express';
import multer from 'multer';
import { env } from '../config/env.js';
import { authenticate, requireAuth } from '../middleware/auth.js';
import { uploadLimiter } from '../middleware/rate-limit.js';
import { uuidParam } from '../schemas/common.js';
import { ExpenseCreateSchema, ExpenseQuerySchema, ExpenseUpdateSchema } from '../schemas/index.js';
import * as expenseService from '../services/expense.service.js';

/**
 * Subida de justificantes: en memoria, un único fichero, sin campos adicionales y con tamaño
 * máximo acotado (A06: consumo de recursos). El contenido se valida después por su firma.
 */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.MAX_UPLOAD_BYTES, files: 1, fields: 0, parts: 1, fieldNameSize: 50 },
});

export const expensesRouter = Router();
expensesRouter.use(authenticate);

expensesRouter.get('/', async (req, res) => {
  const query = ExpenseQuerySchema.parse(req.query);
  res.json(await expenseService.listExpenses(requireAuth(req), query));
});

expensesRouter.post('/', async (req, res) => {
  const input = ExpenseCreateSchema.parse(req.body);
  res.status(201).json(await expenseService.createExpense(req, requireAuth(req), input));
});

expensesRouter.get('/:id', async (req, res) => {
  const { id } = uuidParam.parse(req.params);
  res.json(await expenseService.getExpense(req, requireAuth(req), id));
});

expensesRouter.patch('/:id', async (req, res) => {
  const { id } = uuidParam.parse(req.params);
  const input = ExpenseUpdateSchema.parse(req.body);
  res.json(await expenseService.updateExpense(req, requireAuth(req), id, input));
});

expensesRouter.delete('/:id', async (req, res) => {
  const { id } = uuidParam.parse(req.params);
  await expenseService.deleteExpense(req, requireAuth(req), id);
  res.status(204).end();
});

expensesRouter.post('/:id/receipt', uploadLimiter, upload.single('receipt'), async (req, res) => {
  const { id } = uuidParam.parse(req.params);
  res.status(201).json(await expenseService.attachReceipt(req, requireAuth(req), id, req.file));
});

expensesRouter.get('/:id/receipt', async (req, res) => {
  const { id } = uuidParam.parse(req.params);
  const receipt = await expenseService.getReceipt(req, requireAuth(req), id);
  // El fichero se descarga siempre como adjunto, con su tipo real, sin "sniffing" y aislado
  // mediante CSP sandbox para que nunca se ejecute contenido activo en el origen de la app.
  res.setHeader('Content-Type', receipt.mimeType);
  res.setHeader('Content-Disposition', `attachment; filename="justificante"; filename*=UTF-8''${encodeURIComponent(receipt.originalName)}`);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
  res.setHeader('Cache-Control', 'private, no-store');
  res.send(receipt.content);
});

expensesRouter.delete('/:id/receipt', async (req, res) => {
  const { id } = uuidParam.parse(req.params);
  await expenseService.deleteReceipt(req, requireAuth(req), id);
  res.status(204).end();
});
