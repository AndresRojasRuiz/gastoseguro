/**
 * Esquemas de entrada de cada recurso de la API. Todos son objetos estrictos: los campos no
 * declarados (por ejemplo "role", "userId" o "status" en un registro) provocan un error 400.
 */
import { z } from 'zod';
import {
  currencySchema,
  emailSchema,
  isoDate,
  pagination,
  passwordInput,
  PAYMENT_METHODS,
  ROLES,
  safeText,
  searchText,
  totpCode,
  USER_STATUSES,
} from './common.js';

const atLeastOneField = (value: Record<string, unknown>) => Object.values(value).some((field) => field !== undefined);

// --- Autenticación -------------------------------------------------------------------------
export const RegisterSchema = z
  .object({
    name: safeText(80, 2),
    email: emailSchema,
    password: passwordInput,
    currency: currencySchema.default('EUR'),
  })
  .strict();

export const LoginSchema = z.object({ email: emailSchema, password: passwordInput }).strict();

export const MfaLoginSchema = z.object({ challengeId: z.uuid(), code: totpCode }).strict();

// --- Cuenta --------------------------------------------------------------------------------
export const UpdateProfileSchema = z
  .object({ name: safeText(80, 2).optional(), currency: currencySchema.optional() })
  .strict()
  .refine(atLeastOneField, { message: 'No hay cambios que aplicar' });

export const ChangePasswordSchema = z.object({ currentPassword: passwordInput, newPassword: passwordInput }).strict();

/** Activar el segundo factor modifica la autenticación: exige la contraseña (ASVS 5.0, 7.5.1). */
export const MfaEnableSchema = z.object({ code: totpCode, password: passwordInput }).strict();

export const MfaDisableSchema = z.object({ password: passwordInput, code: totpCode }).strict();

/** Reautenticación con un factor (la contraseña) para cerrar sesiones (ASVS 5.0, 7.5.2). */
export const ReauthSchema = z.object({ password: passwordInput }).strict();

/** Supresión de la cuenta: contraseña y, si el segundo factor está activo, código TOTP. */
export const DeleteAccountSchema = z
  .object({ password: passwordInput, code: totpCode.optional(), confirm: z.literal('ELIMINAR') })
  .strict();

// --- Categorías ----------------------------------------------------------------------------
const colorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/, { message: 'Color no válido (#RRGGBB)' });

export const CategoryCreateSchema = z.object({ name: safeText(40), color: colorSchema }).strict();

export const CategoryUpdateSchema = z
  .object({ name: safeText(40).optional(), color: colorSchema.optional() })
  .strict()
  .refine(atLeastOneField, { message: 'No hay cambios que aplicar' });

// --- Gastos --------------------------------------------------------------------------------
const expenseFields = {
  amount: z.string().trim().min(1).max(20),
  date: isoDate,
  categoryId: z.uuid(),
  description: safeText(200),
  merchant: safeText(100).nullable().optional(),
  paymentMethod: z.enum(PAYMENT_METHODS),
};

export const ExpenseCreateSchema = z.object(expenseFields).strict();

export const ExpenseUpdateSchema = z
  .object({
    amount: expenseFields.amount.optional(),
    date: expenseFields.date.optional(),
    categoryId: expenseFields.categoryId.optional(),
    description: expenseFields.description.optional(),
    merchant: expenseFields.merchant,
    paymentMethod: expenseFields.paymentMethod.optional(),
  })
  .strict()
  .refine(atLeastOneField, { message: 'No hay cambios que aplicar' });

export const ExpenseQuerySchema = z
  .object({
    from: isoDate.optional(),
    to: isoDate.optional(),
    categoryId: z.uuid().optional(),
    q: searchText.optional(),
    sort: z.enum(['date_desc', 'date_asc', 'amount_desc', 'amount_asc']).default('date_desc'),
    ...pagination,
  })
  .strict();

// --- Informes ------------------------------------------------------------------------------
export const SummaryQuerySchema = z
  .object({ month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, { message: 'Mes no válido (AAAA-MM)' }).optional() })
  .strict();

export const ExportQuerySchema = z.object({ from: isoDate.optional(), to: isoDate.optional() }).strict();

// --- Administración y auditoría ------------------------------------------------------------
export const AdminUserQuerySchema = z.object({ q: searchText.optional(), ...pagination }).strict();

export const AdminUserUpdateSchema = z
  .object({ role: z.enum(ROLES).optional(), status: z.enum(USER_STATUSES).optional() })
  .strict()
  .refine(atLeastOneField, { message: 'No hay cambios que aplicar' });

export const AuditQuerySchema = z
  .object({
    action: z.string().regex(/^[A-Z_]{3,40}$/).optional(),
    outcome: z.enum(['SUCCESS', 'FAILURE', 'DENIED']).optional(),
    userId: z.uuid().optional(),
    ...pagination,
  })
  .strict();

export const AlertQuerySchema = z.object({ status: z.enum(['open', 'all']).default('open'), ...pagination }).strict();
