/**
 * Informes y exportación de gastos del propio usuario.
 */
import { toCsv } from '../lib/csv.js';
import { badRequest } from '../lib/errors.js';
import { formatAmount, type Currency } from '../lib/money.js';
import { prisma } from '../lib/prisma.js';
import type { ClientInfo } from '../middleware/request-context.js';
import type { AuthContext } from '../types/express.js';
import { audit } from './audit.service.js';

const MAX_EXPORT_ROWS = 10_000;
const PAYMENT_LABELS: Record<string, string> = { CASH: 'Efectivo', CARD: 'Tarjeta', TRANSFER: 'Transferencia', OTHER: 'Otro' };

const monthKey = (date: Date) => date.toISOString().slice(0, 7);

export async function getSummary(auth: AuthContext, month?: string) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: auth.userId }, select: { currency: true } });
  const currency = user.currency as Currency;
  const reference = month ? new Date(`${month}-01T00:00:00.000Z`) : new Date();
  const monthStart = new Date(Date.UTC(reference.getUTCFullYear(), reference.getUTCMonth(), 1));
  const nextMonthStart = new Date(Date.UTC(reference.getUTCFullYear(), reference.getUTCMonth() + 1, 1));
  const yearStart = new Date(Date.UTC(reference.getUTCFullYear(), reference.getUTCMonth() - 11, 1));

  const [categories, monthExpenses, yearExpenses, recent] = await Promise.all([
    prisma.category.findMany({ where: { userId: auth.userId }, select: { id: true, name: true, color: true } }),
    prisma.expense.groupBy({
      by: ['categoryId'],
      where: { userId: auth.userId, deletedAt: null, date: { gte: monthStart, lt: nextMonthStart } },
      _sum: { amountMinor: true },
      _count: { _all: true },
    }),
    prisma.expense.findMany({
      where: { userId: auth.userId, deletedAt: null, date: { gte: yearStart, lt: nextMonthStart } },
      select: { date: true, amountMinor: true },
      take: 50_000,
    }),
    prisma.expense.findMany({
      where: { userId: auth.userId, deletedAt: null },
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      take: 5,
      select: { id: true, date: true, description: true, amountMinor: true, category: { select: { name: true, color: true } } },
    }),
  ]);

  const byCategory = monthExpenses
    .map((group) => {
      const category = categories.find((item) => item.id === group.categoryId);
      return {
        categoryId: group.categoryId,
        name: category?.name ?? 'Sin categoría',
        color: category?.color ?? '#64748b',
        count: group._count._all,
        totalMinor: group._sum.amountMinor ?? 0,
      };
    })
    .sort((a, b) => b.totalMinor - a.totalMinor);

  const months = new Map<string, number>();
  for (let index = 0; index < 12; index += 1) {
    months.set(monthKey(new Date(Date.UTC(yearStart.getUTCFullYear(), yearStart.getUTCMonth() + index, 1))), 0);
  }
  for (const expense of yearExpenses) {
    const key = monthKey(expense.date);
    if (months.has(key)) months.set(key, (months.get(key) ?? 0) + expense.amountMinor);
  }

  const monthTotal = byCategory.reduce((sum, item) => sum + item.totalMinor, 0);
  const monthCount = byCategory.reduce((sum, item) => sum + item.count, 0);
  const previousMonth = [...months.values()].at(-2) ?? 0;

  return {
    currency,
    month: monthKey(monthStart),
    monthTotal: formatAmount(monthTotal, currency),
    monthTotalMinor: monthTotal,
    monthCount,
    previousMonthTotalMinor: previousMonth,
    byCategory: byCategory.map((item) => ({ ...item, total: formatAmount(item.totalMinor, currency) })),
    monthly: [...months.entries()].map(([key, totalMinor]) => ({ month: key, totalMinor, total: formatAmount(totalMinor, currency) })),
    recent: recent.map((item) => ({
      id: item.id,
      date: item.date.toISOString().slice(0, 10),
      description: item.description,
      amount: formatAmount(item.amountMinor, currency),
      category: item.category,
    })),
  };
}

export async function exportCsv(auth: AuthContext, query: { from?: string | undefined; to?: string | undefined }, client: ClientInfo) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: auth.userId }, select: { currency: true } });
  const currency = user.currency as Currency;
  const where = {
    userId: auth.userId,
    deletedAt: null,
    ...(query.from || query.to
      ? {
          date: {
            ...(query.from ? { gte: new Date(`${query.from}T00:00:00.000Z`) } : {}),
            ...(query.to ? { lte: new Date(`${query.to}T00:00:00.000Z`) } : {}),
          },
        }
      : {}),
  };
  const count = await prisma.expense.count({ where });
  if (count > MAX_EXPORT_ROWS) throw badRequest(`La exportación está limitada a ${MAX_EXPORT_ROWS} registros. Acota el rango de fechas.`);

  const expenses = await prisma.expense.findMany({
    where,
    orderBy: { date: 'asc' },
    select: { date: true, description: true, merchant: true, paymentMethod: true, amountMinor: true, category: { select: { name: true } } },
  });
  const csv = toCsv(
    ['Fecha', 'Categoría', 'Descripción', 'Comercio', 'Método de pago', 'Importe', 'Moneda'],
    expenses.map((expense) => [
      expense.date.toISOString().slice(0, 10),
      expense.category.name,
      expense.description,
      expense.merchant ?? '',
      PAYMENT_LABELS[expense.paymentMethod] ?? expense.paymentMethod,
      formatAmount(expense.amountMinor, currency).replace('.', ','),
      currency,
    ]),
  );
  await audit({ action: 'REPORT_EXPORT', outcome: 'SUCCESS', userId: auth.userId, actorEmail: auth.email, details: { rows: expenses.length, ...query }, client });
  return csv;
}
