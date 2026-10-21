/**
 * Carga de datos de demostración (solo desarrollo).
 *
 * No existen credenciales por defecto en el código (A07:2025): las contraseñas de las cuentas
 * de demostración se leen de las variables SEED_*_PASSWORD del fichero .env, que el script
 * de instalación genera aleatoriamente en cada equipo.
 */
import { env } from '../config/env.js';
import { hashPassword, checkPasswordPolicy } from '../lib/password.js';
import { prisma } from '../lib/prisma.js';
import { audit, flushAudit } from '../services/audit.service.js';

if (env.NODE_ENV === 'production') {
  console.error('El seed de demostración no puede ejecutarse en producción.');
  process.exit(1);
}

const CATEGORY_TEMPLATE = [
  { name: 'Alimentación', color: '#16a34a' },
  { name: 'Transporte', color: '#2563eb' },
  { name: 'Vivienda', color: '#9333ea' },
  { name: 'Salud', color: '#dc2626' },
  { name: 'Ocio', color: '#f59e0b' },
  { name: 'Educación', color: '#0891b2' },
  { name: 'Otros', color: '#64748b' },
];

const SAMPLE_EXPENSES: Array<[string, string, string, number, number]> = [
  // [categoría, descripción, comercio, importe mínimo, importe máximo] (en euros)
  ['Alimentación', 'Compra semanal', 'Mercadona', 45, 120],
  ['Alimentación', 'Fruta y verdura', 'Mercado municipal', 12, 30],
  ['Transporte', 'Abono transporte mensual', 'Consorcio de Transportes', 20, 55],
  ['Transporte', 'Combustible', 'Repsol', 40, 75],
  ['Vivienda', 'Alquiler', 'Inmobiliaria Centro', 750, 750],
  ['Vivienda', 'Factura de electricidad', 'Iberdrola', 45, 90],
  ['Vivienda', 'Internet y móvil', 'Movistar', 39, 39],
  ['Salud', 'Farmacia', 'Farmacia Central', 8, 35],
  ['Ocio', 'Cine', 'Cines Yelmo', 9, 20],
  ['Ocio', 'Cena con amigos', 'Restaurante La Plaza', 25, 60],
  ['Educación', 'Libro técnico de ciberseguridad', 'Casa del Libro', 30, 55],
  ['Otros', 'Regalo de cumpleaños', 'El Corte Inglés', 20, 80],
];

/** Generador pseudoaleatorio determinista (solo para datos de demostración reproducibles). */
function seededRandom(seed: number) {
  let state = seed;
  return () => {
    state = (state * 1_664_525 + 1_013_904_223) % 4_294_967_296;
    return state / 4_294_967_296;
  };
}

async function upsertUser(email: string, name: string, role: string, passwordVariable: string) {
  const password = process.env[passwordVariable];
  if (!password) throw new Error(`Define ${passwordVariable} en el fichero .env (npm run setup lo genera).`);
  const problems = await checkPasswordPolicy(password, { email, name });
  if (problems.length > 0) throw new Error(`${passwordVariable} no cumple la política: ${problems.join(' ')}`);

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return existing;
  const user = await prisma.user.create({ data: { email, name, role, passwordHash: await hashPassword(password) } });
  await prisma.category.createMany({ data: CATEGORY_TEMPLATE.map((category) => ({ ...category, userId: user.id })) });
  await audit({ action: 'AUTH_REGISTER', outcome: 'SUCCESS', userId: user.id, actorEmail: email, details: { source: 'seed', role } });
  console.log(`  ✔ ${role.padEnd(7)} ${email}`);
  return user;
}

async function seedExpenses(userId: string) {
  const already = await prisma.expense.count({ where: { userId } });
  if (already > 0) return;
  const categories = await prisma.category.findMany({ where: { userId } });
  const byName = new Map(categories.map((category) => [category.name, category.id]));
  const random = seededRandom(2026);
  const today = new Date();
  const data = [];
  for (let monthOffset = 11; monthOffset >= 0; monthOffset -= 1) {
    for (const [categoryName, description, merchant, min, max] of SAMPLE_EXPENSES) {
      const isMonthly = min === max || description.includes('mensual') || description.includes('Factura') || description.includes('Internet');
      const occurrences = isMonthly ? 1 : 1 + Math.floor(random() * 3);
      for (let index = 0; index < occurrences; index += 1) {
        const day = 1 + Math.floor(random() * 27);
        const date = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - monthOffset, day));
        if (date > today) continue;
        const amountMinor = Math.round((min + random() * (max - min)) * 100);
        data.push({
          userId,
          categoryId: byName.get(categoryName)!,
          amountMinor,
          date,
          description,
          merchant,
          paymentMethod: random() > 0.25 ? 'CARD' : random() > 0.5 ? 'TRANSFER' : 'CASH',
        });
      }
    }
  }
  await prisma.expense.createMany({ data });
  console.log(`  ✔ ${data.length} gastos de demostración`);
}

async function main() {
  console.log('Creando cuentas de demostración...');
  await upsertUser(process.env.SEED_ADMIN_EMAIL ?? 'admin@gastoseguro.local', 'Administración', 'ADMIN', 'SEED_ADMIN_PASSWORD');
  await upsertUser(process.env.SEED_AUDITOR_EMAIL ?? 'auditor@gastoseguro.local', 'Auditoría Interna', 'AUDITOR', 'SEED_AUDITOR_PASSWORD');
  const demo = await upsertUser(process.env.SEED_USER_EMAIL ?? 'demo@gastoseguro.local', 'Usuario Demo', 'USER', 'SEED_USER_PASSWORD');
  await seedExpenses(demo.id);
  await flushAudit();
  console.log('Las contraseñas están en backend/.env (variables SEED_*_PASSWORD).');
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
