/**
 * Esquemas de validación compartidos (A05:2025 - Injection, A06:2025 - Insecure Design).
 *
 * Toda entrada externa (cuerpo, parámetros de ruta y de consulta) se valida con Zod mediante
 * listas blancas: tipos, longitudes máximas, formatos y rangos. Los objetos se declaran
 * "strict", por lo que cualquier campo no previsto se rechaza (protección frente a
 * asignación masiva / mass assignment, CWE-915).
 */
import { z } from 'zod';
import { CURRENCIES } from '../lib/money.js';

z.config(z.locales.es());

export const ROLES = ['USER', 'AUDITOR', 'ADMIN'] as const;
export type Role = (typeof ROLES)[number];

export const USER_STATUSES = ['ACTIVE', 'DISABLED'] as const;
export const PAYMENT_METHODS = ['CASH', 'CARD', 'TRANSFER', 'OTHER'] as const;

/** Texto libre: sin caracteres de control y con espacios normalizados. */
export const safeText = (max: number, min = 1) =>
  z
    .string()
    .transform((value) => value.normalize('NFKC').replace(/\s+/g, ' ').trim())
    .pipe(
      z
        .string()
        .min(min)
        .max(max)
        .refine((value) => !/\p{Cc}/u.test(value), { message: 'Contiene caracteres no permitidos' }),
    );

/**
 * Texto de búsqueda recibido en la query: acotado y sin caracteres de control. El byte nulo,
 * por ejemplo, provocaba un error en PostgreSQL (hallazgo del análisis dinámico con ZAP).
 */
export const searchText = z
  .string()
  .trim()
  .max(100)
  .refine((value) => !/\p{Cc}/u.test(value), { message: 'Contiene caracteres no permitidos' });

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(254)
  .pipe(z.email({ message: 'Correo electrónico no válido' }));

export const passwordInput = z.string().min(1).max(256);

export const uuidParam = z.object({ id: z.uuid({ message: 'Identificador no válido' }) }).strict();

export const currencySchema = z.enum(CURRENCIES);

export const isoDate = z.iso.date({ message: 'Fecha no válida (AAAA-MM-DD)' });

export const totpCode = z.string().trim().regex(/^\d{6}$/, { message: 'El código debe tener 6 dígitos' });

export const pagination = {
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
};
