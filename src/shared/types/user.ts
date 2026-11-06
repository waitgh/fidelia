import type { UserRole } from './enums.js';

export interface User {
  id: number;
  username: string;
  displayName: string;
  role: UserRole;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateUserInput {
  username: string;
  displayName: string;
  password: string;
  role: UserRole;
}

export interface UpdateUserInput {
  displayName?: string;
  role?: UserRole;
  isActive?: boolean;
}
