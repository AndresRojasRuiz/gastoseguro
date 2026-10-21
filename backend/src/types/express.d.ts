import type { Role } from '../schemas/common.js';

export interface AuthContext {
  userId: string;
  email: string;
  role: Role;
  sessionId: string;
  mfaEnabled: boolean;
}

declare global {
  namespace Express {
    interface Request {
      requestId: string;
      auth?: AuthContext;
    }
  }
}

export {};
