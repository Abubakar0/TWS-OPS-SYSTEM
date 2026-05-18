export type UserRole = 'admin' | 'hunter' | 'lister';

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface LoginResponse {
  token: string;
  user: User;
}

export interface HunterAssignment {
  hunterId: string;
  hunterName: string;
  hunterEmail: string;
  hunterActive: boolean;
  listerId: string | null;
  listerName: string | null;
  listerEmail: string | null;
  listerActive: boolean | null;
}
