/**
 * Gestión de gastos y justificantes (A01, A05, A06 y A10:2025).
 *
 * - Control de acceso a nivel de objeto: todas las operaciones verifican que el gasto
 *   pertenece al usuario autenticado. Si el recurso existe pero es de otro usuario se
 *   responde 404 (no se confirma su existencia) y se audita como intento de acceso indebido.
 * - Reglas de negocio validadas en el servidor: importe positivo con límite máximo, fecha
 *   dentro de un rango razonable y categoría propia.
 * - Borrado lógico para preservar la trazabilidad.
 * - Operaciones de fichero coordinadas con la base de datos para no dejar estados
 *   inconsistentes si una de las dos falla.
 */
import type { Request } from 'express';
import type { Prisma as PrismaTypes } from '../generated/prisma/client.js';
import { badRequest, notFound } from '../lib/errors.js';
import { deleteStoredFile, detectFileType, readStoredFile, sanitizeFileName, storeFile } from '../lib/files.js';
import { formatAmount, parseAmount, type Currency } from '../lib/money.js';
import { prisma } from '../lib/prisma.js';
import { recordAccessDenied } from '../middleware/auth.js';
import { clientInfo } from '../middleware/request-context.js';
import type { AuthContext } from '../types/express.js';
import { audit } from './audit.service.js';

const MIN_DATE = new Date('2000-01-01T00:00:00.000Z');

export interface ExpenseInput {
  amount?: string | undefined;
  date?: string | undefined;
  categoryId?: string | undefined;
  description?: string | undefined;
  merchant?: string | null | undefined;
  paymentMethod?: 'CASH' | 'CARD' | 'TRANSFER' | 'OTHER' | undefined;
}

const expenseSelect = {
  id: true,
  amountMinor: true,
  date: true,
  description: true,
  merchant: true,
  paymentMethod: true,
  createdAt: true,
  updatedAt: true,
  category: { select: { id: true, name: true, color: true } },
  receipt: { select: { originalName: true, mimeType: true, sizeBytes: true, createdAt: true } },
} satisfies PrismaTypes.ExpenseSelect;

type ExpenseRow = PrismaTypes.ExpenseGetPayload<{ select: typeof expenseSelect }>;

const toDto = (expense: ExpenseRow, currency: Currency) => ({
  ...expense,
  amount: formatAmount(expense.amountMinor, currency),
  currency,
  date: expense.date.toISOString().slice(0, 10),
});

async function userCurrency(userId: string): Promise<Currency> {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { currency: true } });
  return user.currency as Currency;
}

function parseExpenseDate(value: string): Date {
  const date = new Date(`${value}T00:00:00.000Z`);
  const maxDate = new Date(Date.now() + 24 * 60 * 60 * 1000);
  if (Number.isNaN(date.getTime()) || date < MIN_DATE || date > maxDate) {
    throw badRequest('La fecha debe estar entre el 01/01/2000 y hoy.', [{ field: 'date', message: 'Fecha fuera de rango' }]);
  }
  return date;
}

function parseExpenseAmount(value: string, currency: Currency): number {
  const minor = parseAmount(value, currency);
  if (minor === null) {
    throw badRequest('El importe no es válido.', [{ field: 'amount', message: 'Importe positivo con un máximo de 2 decimales y dentro del límite permitido' }]);
  }
  return minor;
}

async function assertOwnedCategory(auth: AuthContext, categoryId: string): Promise<void> {
  const category = await prisma.category.findFirst({ where: { id: categoryId, userId: auth.userId }, select: { id: true } });
  if (!category) throw badRequest('La categoría no es válida.', [{ field: 'categoryId', message: 'Categoría inexistente' }]);
}

/**
 * Obtiene un gasto comprobando la propiedad. Distingue internamente "no existe" de
 * "existe pero es ajeno" para auditar el segundo caso, pero responde igual en ambos.
 */
async function findOwnedExpense(req: Request, auth: AuthContext, id: string) {
  const expense = await prisma.expense.findUnique({ where: { id }, select: { id: true, userId: true, deletedAt: true } });
  if (!expense || expense.deletedAt) throw notFound('El gasto no existe.');
  if (expense.userId !== auth.userId) {
    await recordAccessDenied(req, 'Acceso a un gasto de otro usuario (IDOR)', { type: 'Expense', id });
    throw notFound('El gasto no existe.');
  }
  return expense;
}

export async function listExpenses(
  auth: AuthContext,
  query: { from?: string | undefined; to?: string | undefined; categoryId?: string | undefined; q?: string | undefined; sort: string; page: number; pageSize: number },
) {
  const where: PrismaTypes.ExpenseWhereInput = { userId: auth.userId, deletedAt: null };
  if (query.from || query.to) {
    where.date = {
      ...(query.from ? { gte: new Date(`${query.from}T00:00:00.000Z`) } : {}),
      ...(query.to ? { lte: new Date(`${query.to}T00:00:00.000Z`) } : {}),
    };
  }
  if (query.categoryId) where.categoryId = query.categoryId;
  if (query.q) where.OR = [{ description: { contains: query.q } }, { merchant: { contains: query.q } }];

  const orderBy: PrismaTypes.ExpenseOrderByWithRelationInput[] = {
    date_desc: [{ date: 'desc' as const }, { createdAt: 'desc' as const }],
    date_asc: [{ date: 'asc' as const }, { createdAt: 'asc' as const }],
    amount_desc: [{ amountMinor: 'desc' as const }],
    amount_asc: [{ amountMinor: 'asc' as const }],
  }[query.sort as 'date_desc'] ?? [{ date: 'desc' }];

  const [currency, total, rows, aggregate] = await Promise.all([
    userCurrency(auth.userId),
    prisma.expense.count({ where }),
    prisma.expense.findMany({ where, orderBy, skip: (query.page - 1) * query.pageSize, take: query.pageSize, select: expenseSelect }),
    prisma.expense.aggregate({ where, _sum: { amountMinor: true } }),
  ]);
  return {
    items: rows.map((row) => toDto(row, currency)),
    page: query.page,
    pageSize: query.pageSize,
    total,
    totalAmount: formatAmount(aggregate._sum.amountMinor ?? 0, currency),
    currency,
  };
}

export async function getExpense(req: Request, auth: AuthContext, id: string) {
  await findOwnedExpense(req, auth, id);
  const [expense, currency] = await Promise.all([
    prisma.expense.findUniqueOrThrow({ where: { id }, select: expenseSelect }),
    userCurrency(auth.userId),
  ]);
  return toDto(expense, currency);
}

export async function createExpense(req: Request, auth: AuthContext, input: Required<Omit<ExpenseInput, 'merchant'>> & { merchant?: string | null | undefined }) {
  const currency = await userCurrency(auth.userId);
  await assertOwnedCategory(auth, input.categoryId);
  const expense = await prisma.expense.create({
    data: {
      userId: auth.userId,
      categoryId: input.categoryId,
      amountMinor: parseExpenseAmount(input.amount, currency),
      date: parseExpenseDate(input.date),
      description: input.description,
      merchant: input.merchant ?? null,
      paymentMethod: input.paymentMethod,
    },
    select: expenseSelect,
  });
  await audit({ action: 'EXPENSE_CREATE', outcome: 'SUCCESS', userId: auth.userId, actorEmail: auth.email, targetType: 'Expense', targetId: expense.id, client: clientInfo(req) });
  return toDto(expense, currency);
}

export async function updateExpense(req: Request, auth: AuthContext, id: string, input: ExpenseInput) {
  await findOwnedExpense(req, auth, id);
  const currency = await userCurrency(auth.userId);
  if (input.categoryId) await assertOwnedCategory(auth, input.categoryId);
  const data: PrismaTypes.ExpenseUncheckedUpdateInput = {};
  if (input.amount !== undefined) data.amountMinor = parseExpenseAmount(input.amount, currency);
  if (input.date !== undefined) data.date = parseExpenseDate(input.date);
  if (input.categoryId !== undefined) data.categoryId = input.categoryId;
  if (input.description !== undefined) data.description = input.description;
  if (input.merchant !== undefined) data.merchant = input.merchant;
  if (input.paymentMethod !== undefined) data.paymentMethod = input.paymentMethod;

  const expense = await prisma.expense.update({ where: { id }, data, select: expenseSelect });
  await audit({
    action: 'EXPENSE_UPDATE',
    outcome: 'SUCCESS',
    userId: auth.userId,
    actorEmail: auth.email,
    targetType: 'Expense',
    targetId: id,
    details: { fields: Object.keys(data) },
    client: clientInfo(req),
  });
  return toDto(expense, currency);
}

export async function deleteExpense(req: Request, auth: AuthContext, id: string) {
  await findOwnedExpense(req, auth, id);
  await prisma.expense.update({ where: { id }, data: { deletedAt: new Date() } });
  await audit({ action: 'EXPENSE_DELETE', outcome: 'SUCCESS', userId: auth.userId, actorEmail: auth.email, targetType: 'Expense', targetId: id, client: clientInfo(req) });
}

// --- Justificantes -------------------------------------------------------------------------

export async function attachReceipt(req: Request, auth: AuthContext, id: string, file: Express.Multer.File | undefined) {
  await findOwnedExpense(req, auth, id);
  if (!file) throw badRequest('Debes adjuntar un fichero en el campo "receipt".');

  const mimeType = detectFileType(file.buffer);
  if (!mimeType) {
    await audit({
      action: 'RECEIPT_REJECTED',
      outcome: 'DENIED',
      userId: auth.userId,
      actorEmail: auth.email,
      targetType: 'Expense',
      targetId: id,
      details: { declaredType: file.mimetype.slice(0, 100), size: file.size },
      client: clientInfo(req),
    });
    throw badRequest('Formato de fichero no permitido. Solo se aceptan PDF, PNG, JPEG o WebP.');
  }

  const stored = await storeFile(file.buffer);
  let previousStoredName: string | null = null;
  try {
    await prisma.$transaction(async (tx) => {
      const previous = await tx.receipt.findUnique({ where: { expenseId: id }, select: { storedName: true } });
      previousStoredName = previous?.storedName ?? null;
      if (previous) await tx.receipt.delete({ where: { expenseId: id } });
      await tx.receipt.create({
        data: {
          expenseId: id,
          storedName: stored.storedName,
          originalName: sanitizeFileName(file.originalname, mimeType),
          mimeType,
          sizeBytes: file.size,
          sha256: stored.sha256,
        },
      });
    });
  } catch (error) {
    // Si la base de datos falla, se elimina el fichero recién escrito (sin huérfanos).
    await deleteStoredFile(stored.storedName);
    throw error;
  }
  if (previousStoredName) await deleteStoredFile(previousStoredName);

  await audit({
    action: 'RECEIPT_UPLOAD',
    outcome: 'SUCCESS',
    userId: auth.userId,
    actorEmail: auth.email,
    targetType: 'Expense',
    targetId: id,
    details: { mimeType, size: file.size, sha256: stored.sha256 },
    client: clientInfo(req),
  });
  return getExpense(req, auth, id);
}

export async function getReceipt(req: Request, auth: AuthContext, id: string) {
  await findOwnedExpense(req, auth, id);
  const receipt = await prisma.receipt.findUnique({ where: { expenseId: id } });
  if (!receipt) throw notFound('El gasto no tiene justificante.');
  const content = await readStoredFile(receipt.storedName, receipt.sha256);
  await audit({ action: 'RECEIPT_DOWNLOAD', outcome: 'SUCCESS', userId: auth.userId, actorEmail: auth.email, targetType: 'Expense', targetId: id, client: clientInfo(req) });
  return { content, mimeType: receipt.mimeType, originalName: receipt.originalName };
}

export async function deleteReceipt(req: Request, auth: AuthContext, id: string) {
  await findOwnedExpense(req, auth, id);
  const receipt = await prisma.receipt.findUnique({ where: { expenseId: id } });
  if (!receipt) throw notFound('El gasto no tiene justificante.');
  await prisma.receipt.delete({ where: { expenseId: id } });
  await deleteStoredFile(receipt.storedName);
  await audit({ action: 'RECEIPT_DELETE', outcome: 'SUCCESS', userId: auth.userId, actorEmail: auth.email, targetType: 'Expense', targetId: id, client: clientInfo(req) });
}
