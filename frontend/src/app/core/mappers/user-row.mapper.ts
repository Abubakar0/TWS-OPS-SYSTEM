import { User } from '../models/auth.models';

export interface UserRowViewModel {
  id: string;
  user: User;
  statusLabel: 'active' | 'disabled';
  canEdit: boolean;
}

export const mapUserRow = (user: User, currentUserRole: User['role'] | undefined): UserRowViewModel => ({
  id: user.id,
  user,
  statusLabel: user.isActive ? 'active' : 'disabled',
  canEdit: user.role !== 'admin' || currentUserRole === 'super_admin',
});
