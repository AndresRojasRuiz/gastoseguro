/**
 * Categorías de gasto. Cada consulta se filtra por el propietario autenticado: un usuario
 * nunca puede leer ni modificar categorías ajenas (A01:2025, CWE-639).
 */
import { conflict, notFound } from '../lib/errors.js';
import { prisma } from '../lib/prisma.js';
import type { ClientInfo } from '../middleware/request-context.js';
import type { AuthContext } from '../types/express.js';
import { audit } from './audit.service.js';

const MAX_CATEGORIES_PER_USER = 50;

export async function listCategories(auth: AuthContext) {
  const categories = await prisma.category.findMany({
    where: { userId: auth.userId },
    orderBy: { name: 'asc' },
    select: { id: true, name: true, color: true, _count: { select: { expenses: { where: { deletedAt: null } } } } },
  });
  return categories.map(({ _count, ...category }) => ({ ...category, expenseCount: _count.expenses }));
}

export async function createCategory(auth: AuthContext, input: { name: string; color: string }, client: ClientInfo) {
  const count = await prisma.category.count({ where: { userId: auth.userId } });
  if (count >= MAX_CATEGORIES_PER_USER) throw conflict(`No se pueden crear más de ${MAX_CATEGORIES_PER_USER} categorías.`);
  const category = await prisma.category.create({
    data: { userId: auth.userId, name: input.name, color: input.color },
    select: { id: true, name: true, color: true },
  });
  await audit({ action: 'CATEGORY_CREATE', outcome: 'SUCCESS', userId: auth.userId, actorEmail: auth.email, targetType: 'Category', targetId: category.id, client });
  return category;
}

async function findOwnedCategory(auth: AuthContext, id: string) {
  const category = await prisma.category.findFirst({ where: { id, userId: auth.userId } });
  if (!category) throw notFound('La categoría no existe.');
  return category;
}

export async function updateCategory(auth: AuthContext, id: string, input: { name?: string | undefined; color?: string | undefined }, client: ClientInfo) {
  await findOwnedCategory(auth, id);
  const category = await prisma.category.update({
    where: { id },
    data: { ...(input.name ? { name: input.name } : {}), ...(input.color ? { color: input.color } : {}) },
    select: { id: true, name: true, color: true },
  });
  await audit({ action: 'CATEGORY_UPDATE', outcome: 'SUCCESS', userId: auth.userId, actorEmail: auth.email, targetType: 'Category', targetId: id, client });
  return category;
}

export async function deleteCategory(auth: AuthContext, id: string, client: ClientInfo) {
  await findOwnedCategory(auth, id);
  const inUse = await prisma.expense.count({ where: { categoryId: id } });
  if (inUse > 0) throw conflict('La categoría tiene gastos asociados y no puede eliminarse.');
  await prisma.category.delete({ where: { id } });
  await audit({ action: 'CATEGORY_DELETE', outcome: 'SUCCESS', userId: auth.userId, actorEmail: auth.email, targetType: 'Category', targetId: id, client });
}
