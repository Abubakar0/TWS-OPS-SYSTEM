export type UserRole = 'admin' | 'hunter' | 'lister';

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  isActive: boolean;
}

export interface LoginResponse {
  token: string;
  user: User;
}
