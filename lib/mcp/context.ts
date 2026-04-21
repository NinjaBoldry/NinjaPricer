import type { Role } from '@prisma/client';

export interface McpUser {
  id: string;
  email: string;
  name: string | null;
  role: Role;
}

export interface McpToken {
  id: string;
  label: string;
  ownerUserId: string;
}

export interface McpContext {
  user: McpUser;
  token: McpToken;
}
