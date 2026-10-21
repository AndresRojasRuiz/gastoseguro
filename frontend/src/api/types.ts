export type Role = 'USER' | 'AUDITOR' | 'ADMIN';
export type Currency = 'EUR' | 'USD' | 'CLP';
export type PaymentMethod = 'CASH' | 'CARD' | 'TRANSFER' | 'OTHER';

export interface User {
  id: string;
  email: string;
  name: string;
  role: Role;
  currency: Currency;
  mfaEnabled: boolean;
  createdAt: string;
  lastLoginAt: string | null;
}

export interface AuthResponse {
  accessToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
  sessionExpiresAt: string;
  user: User;
}

export interface MfaChallenge {
  mfaRequired: true;
  challengeId: string;
  expiresAt: string;
}

export interface Category {
  id: string;
  name: string;
  color: string;
  expenseCount?: number;
}

export interface Expense {
  id: string;
  amount: string;
  amountMinor: number;
  currency: Currency;
  date: string;
  description: string;
  merchant: string | null;
  paymentMethod: PaymentMethod;
  category: Pick<Category, 'id' | 'name' | 'color'>;
  receipt: { originalName: string; mimeType: string; sizeBytes: number; createdAt: string } | null;
  createdAt: string;
  updatedAt: string;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ExpenseList extends Paginated<Expense> {
  totalAmount: string;
  currency: Currency;
}

export interface Summary {
  currency: Currency;
  month: string;
  monthTotal: string;
  monthTotalMinor: number;
  monthCount: number;
  previousMonthTotalMinor: number;
  byCategory: Array<{ categoryId: string; name: string; color: string; count: number; totalMinor: number; total: string }>;
  monthly: Array<{ month: string; totalMinor: number; total: string }>;
  recent: Array<{ id: string; date: string; description: string; amount: string; category: { name: string; color: string } }>;
}

export interface SessionInfo {
  id: string;
  createdAt: string;
  lastUsedAt: string;
  expiresAt: string;
  ip: string | null;
  userAgent: string | null;
  current: boolean;
}

export interface ActivityEntry {
  id: number;
  createdAt: string;
  action: string;
  outcome: 'SUCCESS' | 'FAILURE' | 'DENIED';
  ip: string | null;
  userAgent: string | null;
}

export interface AuditEntry extends ActivityEntry {
  userId: string | null;
  actorEmail: string | null;
  targetType: string | null;
  targetId: string | null;
  requestId: string | null;
  details: string | null;
  prevHash: string;
  hash: string;
}

export interface AdminUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  status: 'ACTIVE' | 'DISABLED';
  mfaEnabled: boolean;
  lockedUntil: string | null;
  lastLoginAt: string | null;
  createdAt: string;
}

export interface SecurityAlert {
  id: string;
  createdAt: string;
  type: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  message: string;
  userId: string | null;
  ip: string | null;
  details: string | null;
  acknowledgedAt: string | null;
  acknowledgedBy: string | null;
}

export interface ChainVerification {
  valid: boolean;
  checked: number;
  brokenAtId?: number;
  reason?: string;
}
