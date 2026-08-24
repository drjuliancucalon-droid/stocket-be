import type { D1Database } from '@cloudflare/workers-types';

export type Env = {
  DB: D1Database;
  JWT_SECRET: string;
};

export type Vars = {
  userId: string;
  userEmail: string;
  orgId: string;
  orgRole: 'admin' | 'member';
  isSuperAdmin: boolean;
};
